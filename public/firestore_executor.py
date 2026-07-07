"""
firestore_executor.py — Exécuteur MT5 SORTANT-ONLY (version complète)
═══════════════════════════════════════════════════════════════════════
Remplace mt5_server.py ENTIÈREMENT. Aucun port inbound. Le VPS ne fait que
PARLER vers Firestore (HTTPS sortant). Les bots n'ont plus rien à scanner.

Ce script fait DEUX choses :

 A) EXÉCUTE les ordres lus dans la file Firestore `orders`
    (OPEN / MODIFY_SL / CLOSE / CLOSE_ALL), ack par-VPS, sizing par compte.

 B) PUBLIE les données de marché dans Firestore (remplace les 7 routes que
    le front appelait encore sur le VPS) :
      - prices/{symbol}      bid/ask/mid           (toutes les ~15 s)
      - h4closes/{symbol}    3 dernières clôtures  (toutes les ~60 s)
      - pip_values/{symbol}  pip value + volumes   (toutes les ~5 min)
      - vps_status/{vps_id}  compte + positions + pending + historique récent

Pré-requis VPS :
  pip install MetaTrader5 google-cloud-firestore
  - Terminal MT5 ouvert et connecté.
  - serviceAccount.json (clé Firebase Admin) dans le même dossier.
  - vps_id.txt : identifiant unique de CE VPS (ex: "vps-amine-01").
  - symbols.txt (optionnel) : un symbole par ligne. Défaut ci-dessous.
"""

import os, time, threading, contextlib
from datetime import datetime, timezone, timedelta

_DIR = os.path.dirname(os.path.abspath(__file__))

def _read(name, default=None):
    p = os.path.join(_DIR, name)
    if not os.path.exists(p):
        return default
    with open(p, "r", encoding="utf-8-sig") as f:
        return f.read().strip()

VPS_ID        = _read("vps_id.txt") or os.environ.get("VPS_ID", "vps-unknown")
# IDs de compte gérés par CE VPS (optionnel) : un par ligne dans account_ids.txt.
# Sert à matcher un target qui contient des IDs de compte plutôt que "ALL"/vps_id.
_acc_raw = _read("account_ids.txt")
MY_ACCOUNT_IDS = {l.strip() for l in _acc_raw.splitlines() if l.strip()} if _acc_raw else set()
SA_PATH       = os.path.join(_DIR, "serviceAccount.json")
MAGIC         = int(os.environ.get("MT5_MAGIC", "234000"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5"))    # poll file ordres (réactif)
GRACE_MIN     = int(os.environ.get("GRACE_MIN", "3"))          # fenêtre de re-scan des ordres (réduite)
STALE_MARKET  = int(os.environ.get("STALE_MARKET_SEC", "120"))
SCHED_GRACE   = int(os.environ.get("SCHED_GRACE_SEC", "90"))   # retard max toléré sur un ordre programmé
SCHED_SEC     = int(os.environ.get("SCHED_SEC", "30"))         # cadence vérif ordres programmés (30s)
TRAIL_SEC     = int(os.environ.get("TRAIL_SEC", "30"))         # cadence vérif trailing (30s, suffit pour un close de bougie)
# ── Ordres conditionnels sur cassure (breakout) ───────────────────
FEE_BUFFER    = float(os.environ.get("FEE_BUFFER", "0.05"))    # -5% sur le lot (couvre commission/frais)
GAP_TOL       = float(os.environ.get("GAP_TOL", "0.02"))       # anti-gap : écart max prix-close = 2% du chemin close->TP
# ── Journal (sync trades) ─────────────────────────────────────────
OWNER_ID      = _read("owner_id.txt") or os.environ.get("OWNER_ID", "")  # tag des trades pour le journal
# ── Push web (notifications iPhone via pywebpush) ─────────────────
# vapid.txt : 3 lignes -> public_key / private_key / mailto
_vapid_raw = _read("vapid.txt")
if _vapid_raw:
    _vl = [l.strip() for l in _vapid_raw.splitlines() if l.strip()]
    VAPID_PUBLIC  = _vl[0] if len(_vl) > 0 else ""
    VAPID_PRIVATE = _vl[1] if len(_vl) > 1 else ""
    VAPID_MAILTO  = _vl[2] if len(_vl) > 2 else "mailto:example@example.com"
else:
    VAPID_PUBLIC = VAPID_PRIVATE = ""
    VAPID_MAILTO = "mailto:example@example.com"
PUSH_ENABLED = bool(VAPID_PRIVATE)
JOURNAL_HOUR  = int(os.environ.get("JOURNAL_HOUR", "22"))     # heure VPS de la sync des trades FERMÉS (1x/jour)
OPEN_SYNC_SEC = int(os.environ.get("OPEN_SYNC_SEC", "17280")) # positions EN COURS -> trades (~5x/jour = 86400/5)

# ── Trailing SL par paliers (appliqué au close H4) ────────────────
# Seuil franchi (mèche comprise) sur la bougie H4 fermée -> SL placé à `frac`
# du chemin PE->TP. Ratchet : le SL ne recule jamais. Ordre décroissant (on prend
# le palier le plus haut atteint).
# Timeframes supportés pour le trailing (lus depuis signals/{id}.timeframe).
# Chaque position est traitée selon SON timeframe : H1 -> close horaire, H4 -> close 4h.
TRAIL_TF_DEFAULT = "H4"   # défaut si le signal n'a pas de timeframe
MARCHES = [
    {"seuil": 0.95, "marche": 3, "frac": 0.50, "label": "+50%"},
    {"seuil": 0.75, "marche": 2, "frac": 0.25, "label": "+25%"},
    {"seuil": 0.50, "marche": 1, "frac": 0.00, "label": "BE"},
]

# Cadence de publication (s)
HEARTBEAT_SEC = 15     # prices + vps_status
H4_SEC        = 60     # h4closes
PIP_SEC       = 300    # pip_values

# Symboles publiés (prix, closes, pip). Édite symbols.txt pour changer.
_sym_raw = _read("symbols.txt")
if _sym_raw:
    SYMBOLS = [s.strip() for s in _sym_raw.splitlines() if s.strip()]
else:
    SYMBOLS = ["USDJPY", "EURJPY", "GBPJPY", "EURGBP", "AUDNZD"]

print(f"[BOOT] VPS_ID={VPS_ID} | MAGIC={MAGIC} | poll={POLL_INTERVAL}s | symbols={SYMBOLS}")

# ── MetaTrader5 : connexion sérialisée + reconnexion auto ─────────
_mt5_lock = threading.RLock()
mt5 = None
_last_attempt = 0.0
_RETRY_COOLDOWN = 10

def _init_mt5():
    try:
        import MetaTrader5 as _mt5
    except ImportError:
        print("[MT5] Package absent — pip install MetaTrader5"); return None
    try:
        if not _mt5.initialize():
            print(f"[MT5] initialize() échoué : {_mt5.last_error()}"); return None
        ai = _mt5.account_info()
        if ai is None:
            print("[MT5] account_info() None."); return None
        print(f"[MT5] Connecté — login={ai.login} server={ai.server} balance={ai.balance:.2f}")
        return _mt5
    except Exception as e:
        print(f"[MT5] Exception init : {e}"); return None

def _ensure_mt5():
    global mt5, _last_attempt
    if mt5 is not None:
        try:
            if mt5.account_info() is not None:
                return mt5
        except Exception:
            pass
    now = time.time()
    if now - _last_attempt < _RETRY_COOLDOWN:
        return mt5
    _last_attempt = now
    mt5 = _init_mt5()
    return mt5

@contextlib.contextmanager
def mt5_session():
    with _mt5_lock:
        yield _ensure_mt5()

# ── Helpers prix / sizing ─────────────────────────────────────────

def num(v, default=0.0):
    """Normalise un prix/volume en float, quelle que soit son origine.
    Gère la virgule décimale française ('162,30' -> 162.30) car MT5 n'accepte
    QUE le point. Robuste aux strings, None, espaces."""
    if v is None:
        return default
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).strip().replace(",", "."))
    except (TypeError, ValueError):
        return default

def _symbol_ready(m, symbol):
    m.symbol_select(symbol, True)
    return m.symbol_info(symbol)

def lot_from_risk(m, symbol, entry, sl, risk_pct):
    info = _symbol_ready(m, symbol)
    if info is None: return None
    ai = m.account_info()
    if ai is None: return None
    risk_amount = ai.balance * (risk_pct / 100.0)
    dist = abs(float(entry) - float(sl))
    if dist <= 0 or info.trade_tick_size <= 0: return None
    loss_per_lot = dist / info.trade_tick_size * info.trade_tick_value
    if loss_per_lot <= 0: return None
    lots = risk_amount / loss_per_lot
    lots = lots * (1.0 - FEE_BUFFER)            # -5% : marge pour commission/frais
    step = info.volume_step or 0.01
    lots = round(round(lots / step) * step, 2)
    return max(info.volume_min, min(info.volume_max, lots))

def _filling(m, info, is_market):
    if not is_market:
        return m.ORDER_FILLING_RETURN
    fm = info.filling_mode if info else 0
    if fm & 2:  return m.ORDER_FILLING_IOC
    if fm & 1:  return m.ORDER_FILLING_FOK
    return m.ORDER_FILLING_RETURN

ORDER_TYPES = lambda m: {
    "BUY": m.ORDER_TYPE_BUY, "SELL": m.ORDER_TYPE_SELL,
    "BUY_LIMIT": m.ORDER_TYPE_BUY_LIMIT, "SELL_LIMIT": m.ORDER_TYPE_SELL_LIMIT,
    "BUY_STOP": m.ORDER_TYPE_BUY_STOP, "SELL_STOP": m.ORDER_TYPE_SELL_STOP,
}

# ── A) Exécution des ordres ───────────────────────────────────────

def do_open(o):
    with mt5_session() as m:
        if m is None: return {"ok": False, "error": "MT5 indisponible"}
        action   = str(o.get("action", "")).upper()
        symbol   = str(o.get("symbol", ""))
        signal   = str(o.get("signal_id", ""))[:28]
        sl       = num(o.get("sl"))
        tp       = num(o.get("tp"))
        risk_pct = num(o.get("risk_pct"))

        info = _symbol_ready(m, symbol)
        if info is None: return {"ok": False, "error": f"Symbole inconnu : {symbol}"}
        tick = m.symbol_info_tick(symbol)
        if tick is None: return {"ok": False, "error": "pas de tick"}

        types = ORDER_TYPES(m)
        if action not in types: return {"ok": False, "error": f"action inconnue : {action}"}

        is_market = action in ("BUY", "SELL")
        entry = (tick.ask if action == "BUY" else tick.bid) if is_market else num(o.get("entry"))
        if entry <= 0: return {"ok": False, "error": "entry invalide"}

        if risk_pct > 0 and sl > 0:
            volume = lot_from_risk(m, symbol, entry, sl, risk_pct)
        else:
            volume = num(o.get("volume"))
            step = info.volume_step or 0.01
            volume = max(info.volume_min, min(info.volume_max, round(round(volume/step)*step, 2)))
        if not volume or volume <= 0: return {"ok": False, "error": "volume calculé nul"}

        req = {
            "action":       m.TRADE_ACTION_DEAL if is_market else m.TRADE_ACTION_PENDING,
            "symbol": symbol, "volume": volume, "type": types[action], "price": entry,
            "sl": sl, "tp": tp, "deviation": 20, "magic": MAGIC,
            "comment": signal or "fs", "type_time": m.ORDER_TIME_GTC,
            "type_filling": _filling(m, info, is_market),
        }
        res = m.order_send(req)
        if res is None: return {"ok": False, "error": f"order_send None : {m.last_error()}"}
        if res.retcode == m.TRADE_RETCODE_DONE:
            return {"ok": True, "ticket": res.order, "fill_price": res.price, "volume": res.volume}
        return {"ok": False, "retcode": res.retcode, "error": res.comment}

def do_modify_sl(o):
    with mt5_session() as m:
        if m is None: return {"ok": False, "error": "MT5 indisponible"}
        signal = str(o.get("signal_id", ""))[:28]
        new_sl = num(o.get("new_sl") or o.get("sl"))
        positions = m.positions_get()
        if not positions: return {"ok": True, "modified": 0, "note": "aucune position"}
        modified, errors = 0, []
        for p in positions:
            if p.magic != MAGIC: continue
            if signal and not str(p.comment).startswith(signal): continue
            r = m.order_send({"action": m.TRADE_ACTION_SLTP, "position": p.ticket,
                              "symbol": p.symbol, "sl": new_sl, "tp": p.tp})
            if r and r.retcode == m.TRADE_RETCODE_DONE: modified += 1
            else: errors.append(f"#{p.ticket}:{r.comment if r else 'None'}")
        return {"ok": len(errors) == 0, "modified": modified, "errors": errors}

def do_close(o, all_positions=False):
    with mt5_session() as m:
        if m is None: return {"ok": False, "error": "MT5 indisponible"}
        signal = str(o.get("signal_id", ""))[:28]
        symbol = str(o.get("symbol", "")) or None
        positions = m.positions_get(symbol=symbol) if symbol else m.positions_get()
        if not positions: return {"ok": True, "closed": 0, "note": "aucune position"}
        closed, errors = 0, []
        for p in positions:
            if p.magic != MAGIC: continue
            if (not all_positions) and signal and not str(p.comment).startswith(signal): continue
            t = m.symbol_info_tick(p.symbol)
            if t is None: errors.append(f"#{p.ticket}:no tick"); continue
            ctype  = m.ORDER_TYPE_SELL if p.type == m.ORDER_TYPE_BUY else m.ORDER_TYPE_BUY
            cprice = t.bid if p.type == m.ORDER_TYPE_BUY else t.ask
            r = m.order_send({"action": m.TRADE_ACTION_DEAL, "symbol": p.symbol, "volume": p.volume,
                              "type": ctype, "position": p.ticket, "price": cprice, "deviation": 20,
                              "magic": MAGIC, "comment": "fs close", "type_time": m.ORDER_TIME_GTC,
                              "type_filling": m.ORDER_FILLING_IOC})
            if r and r.retcode == m.TRADE_RETCODE_DONE: closed += 1
            else: errors.append(f"#{p.ticket}:{r.comment if r else 'None'}")
        return {"ok": len(errors) == 0, "closed": closed, "errors": errors}

def dispatch(o):
    t = str(o.get("type", "")).upper()
    if t == "OPEN":       return do_open(o)
    if t == "MODIFY_SL":  return do_modify_sl(o)
    if t == "CLOSE":      return do_close(o, all_positions=False)
    if t == "CLOSE_ALL":  return do_close(o, all_positions=True)
    return {"ok": False, "error": f"type inconnu : {t}"}

# ── B) Lecture des données de marché (pour publication) ───────────

def read_price(m, symbol):
    info = _symbol_ready(m, symbol)
    if info is None: return None
    tick = m.symbol_info_tick(symbol)
    if tick is None: return None
    d = info.digits or 5
    bid, ask = round(tick.bid, d), round(tick.ask, d)
    return {"bid": bid, "ask": ask, "mid": round((bid + ask) / 2, d), "digits": d,
            "ts": int(time.time())}

def read_h4closes(m, symbol, count=3):
    info = _symbol_ready(m, symbol)
    if info is None: return None
    rates = m.copy_rates_from_pos(symbol, m.TIMEFRAME_H4, 1, count)  # index 1 = derniere H4 FERMEE
    if rates is None or len(rates) == 0: return None
    d = info.digits or 5
    closes = [{"time": int(r["time"]), "open": round(float(r["open"]), d),
               "high": round(float(r["high"]), d), "low": round(float(r["low"]), d),
               "close": round(float(r["close"]), d)} for r in rates]
    return {"closes": closes, "ts": int(time.time())}

def read_pip_value(m, symbol):
    info = _symbol_ready(m, symbol)
    if info is None or info.trade_tick_size <= 0: return None
    pip_size  = 0.01 if info.digits in (2, 3) else 0.0001
    pip_value = info.trade_tick_value / info.trade_tick_size * pip_size
    return {"pip_value": round(pip_value, 4), "volume_min": info.volume_min,
            "volume_max": info.volume_max, "volume_step": info.volume_step,
            "digits": info.digits, "ts": int(time.time())}

def read_pending(m):
    orders = m.orders_get()
    if not orders: return []
    out = []
    for o in orders:
        if o.magic != MAGIC: continue
        out.append({"ticket": o.ticket, "symbol": o.symbol, "type": o.type,
                    "volume": o.volume_initial, "price_open": o.price_open,
                    "sl": o.sl, "tp": o.tp, "comment": o.comment, "magic": o.magic})
    return out

def read_history(m, days=7):
    date_from = datetime.now() - timedelta(days=days)
    deals = m.history_deals_get(date_from, datetime.now())
    if not deals: return []
    closing = (m.DEAL_ENTRY_OUT, m.DEAL_ENTRY_INOUT, m.DEAL_ENTRY_OUT_BY)
    out = []
    for d in deals:
        if d.type not in (m.DEAL_TYPE_BUY, m.DEAL_TYPE_SELL): continue
        if d.entry not in closing: continue
        out.append({"ticket": d.ticket, "time": d.time, "symbol": d.symbol,
                    "type": "SELL" if d.type == m.DEAL_TYPE_BUY else "BUY",
                    "volume": d.volume, "price": d.price, "profit": round(d.profit, 2),
                    "swap": round(d.swap, 2), "commission": round(d.commission, 2),
                    "comment": d.comment})
    return sorted(out, key=lambda x: x["time"], reverse=True)[:50]

# ── Publication Firestore (tout sortant) ──────────────────────────

def publish_prices(db):
    with mt5_session() as m:
        if m is None: return
        for sym in SYMBOLS:
            p = read_price(m, sym)
            if p:
                try: db.collection("prices").document(sym).set(p)
                except Exception as e: print(f"[PUB] prices/{sym} : {e}")

def publish_h4(db):
    with mt5_session() as m:
        if m is None: return
        for sym in SYMBOLS:
            h = read_h4closes(m, sym)
            if h:
                try: db.collection("h4closes").document(sym).set(h)
                except Exception as e: print(f"[PUB] h4closes/{sym} : {e}")

def publish_pip(db):
    with mt5_session() as m:
        if m is None: return
        for sym in SYMBOLS:
            pv = read_pip_value(m, sym)
            if pv:
                try: db.collection("pip_values").document(sym).set(pv)
                except Exception as e: print(f"[PUB] pip_values/{sym} : {e}")

def publish_status(db):
    """vps_status/{vps_id} : compte + positions + pending + historique recent.
    Remplace /status, /orders, /history en un seul doc."""
    with mt5_session() as m:
        if m is None:
            payload = {"online": False, "ts": int(time.time())}
        else:
            ai = m.account_info()
            poss = m.positions_get() or []
            poss_list = [
                {"ticket": p.ticket, "symbol": p.symbol,
                 "type": "BUY" if p.type == m.ORDER_TYPE_BUY else "SELL",
                 "volume": p.volume, "profit": round(p.profit, 2),
                 "price_open": p.price_open, "sl": p.sl, "tp": p.tp,
                 "signal": p.comment, "magic": p.magic}
                for p in poss
            ]
            payload = {
                "online": True, "vps_id": VPS_ID,
                "balance": getattr(ai, "balance", None), "equity": getattr(ai, "equity", None),
                "margin": getattr(ai, "margin", None), "free_margin": getattr(ai, "margin_free", None),
                "login": getattr(ai, "login", None), "server": getattr(ai, "server", None),
                "positions": len(poss_list),       # le front attend un NOMBRE ici
                "positions_list": poss_list,        # le front lit la LISTE ici
                "pending": read_pending(m),
                "history": read_history(m, 7),
                "ts": int(time.time()),
            }
    try:
        db.collection("vps_status").document(VPS_ID).set(payload)
    except Exception as e:
        print(f"[PUB] vps_status : {e}")

# ── File d'ordres ─────────────────────────────────────────────────

def targets_me(o):
    """Ce VPS est-il ciblé par l'ordre ?
    Accepte : "ALL" (string), ["ALL"] (tableau), VPS_ID, ou un ID de compte
    listé dans account_ids.txt (un ID par ligne) qui appartient à ce VPS.
    Si target est absent -> ALL (tout le monde)."""
    tgt = o.get("target", "ALL")
    if tgt is None:
        return True
    # normalise en liste de strings
    items = tgt if isinstance(tgt, list) else [tgt]
    items = [str(x).strip() for x in items]
    if "ALL" in items:
        return True
    if VPS_ID in items:
        return True
    # un des IDs de compte gérés par CE VPS ?
    if MY_ACCOUNT_IDS and any(x in MY_ACCOUNT_IDS for x in items):
        return True
    return False

def is_stale(o):
    if str(o.get("type", "")).upper() != "OPEN": return False
    if str(o.get("action", "")).upper() not in ("BUY", "SELL"): return False
    ca = o.get("created_at")
    if ca is None: return False
    try:
        return (datetime.now(timezone.utc) - ca).total_seconds() > STALE_MARKET
    except Exception:
        return False

def process_orders(db, firestore, processed):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=GRACE_MIN)
    q = db.collection("orders").where("created_at", ">", cutoff).order_by("created_at")
    for doc in q.stream():
        oid = doc.id
        if oid in processed: continue
        o = doc.to_dict() or {}
        ack_ref = db.collection("orders").document(oid).collection("acks").document(VPS_ID)
        if ack_ref.get().exists:
            processed.add(oid); continue
        if not targets_me(o):
            processed.add(oid); continue
        if is_stale(o):
            ack_ref.set({"status": "stale", "at": firestore.SERVER_TIMESTAMP})
            processed.add(oid)
            print(f"[SKIP] {oid} perime"); continue
        print(f"[EXEC] {oid} -> {o.get('type')} {o.get('action','')} {o.get('symbol','')}")
        result = dispatch(o)
        ack_ref.set({"status": "done" if result.get("ok") else "error",
                     "result": result, "at": firestore.SERVER_TIMESTAMP})
        # Quand un OPEN réussit, marquer le signal comme "open" (le trailing s'appuie dessus).
        if result.get("ok") and str(o.get("type", "")).upper() == "OPEN":
            sigid = str(o.get("signal_id", ""))
            if sigid:
                try:
                    db.collection("signals").document(sigid).set(
                        {"status": "open", "opened_at": firestore.SERVER_TIMESTAMP},
                        merge=True)
                except Exception as e:
                    print(f"        [signal] maj status echec : {e}")
        processed.add(oid)
        print(f"        -> {'OK' if result.get('ok') else 'ERR'} {result}")

# ── Ordres programmés (déclenchement à une heure VPS) ─────────────

def _scheduled_target_dt(s):
    """Détermine l'instant de déclenchement d'un doc scheduled.
    Priorité à l'epoch absolu (sans piège de fuseau) :
      - run_at_epoch / trigger_epoch : secondes UTC depuis 1970  → datetime aware
      - run_at "HH:MM" ou "HH:MM:SS"  : heure LOCALE du VPS (fallback tests manuels)
    Retourne un datetime comparable à 'now' fourni, ou None si illisible."""
    epoch = s.get("run_at_epoch", s.get("trigger_epoch"))
    if epoch is not None:
        try:
            return ("utc", datetime.fromtimestamp(float(epoch), tz=timezone.utc))
        except (TypeError, ValueError):
            return None
    run_at = str(s.get("run_at", ""))
    if run_at:
        parts = run_at.split(":")
        try:
            hh = int(parts[0]); mm = int(parts[1]); ss = int(parts[2]) if len(parts) > 2 else 0
            return ("local", (hh, mm, ss))
        except (ValueError, IndexError):
            return None
    return None


def process_scheduled(db, firestore):
    """Lit `scheduled`. Déclenche l'ordre quand l'instant prévu est atteint,
    puis passe le doc en 'done'. Accepte epoch UTC absolu OU 'HH:MM[:SS]' local VPS.

    Fenêtre de validité : si l'instant prévu est dépassé de plus de SCHED_GRACE
    secondes (executor down trop longtemps, vieux test...), l'ordre n'est PAS
    exécuté — il est marqué 'expired'. Évite d'entrer en marché à un prix périmé."""
    now_local = datetime.now()                     # horloge VPS (Get-Date)
    now_utc   = datetime.now(timezone.utc)
    for doc in db.collection("scheduled").where("status", "==", "armed").stream():
        s = doc.to_dict() or {}
        target = _scheduled_target_dt(s)
        if target is None:
            continue
        kind, val = target
        if kind == "utc":
            late = (now_utc - val).total_seconds()      # >0 = en retard
        else:  # local HH:MM:SS
            hh, mm, ss = val
            t = now_local.replace(hour=hh, minute=mm, second=ss, microsecond=0)
            late = (now_local - t).total_seconds()

        if late < 0:
            continue                                    # pas encore l'heure
        if late > SCHED_GRACE:
            # trop en retard -> périmé, on n'exécute pas
            doc.reference.update({"status": "expired",
                                  "reason": f"retard {int(late)}s > {SCHED_GRACE}s",
                                  "fired_at": firestore.SERVER_TIMESTAMP})
            print(f"[SCHED] {doc.id} -> PERIME (retard {int(late)}s) - non execute")
            continue

        order = s.get("order") or {}
        # respecter le ciblage aussi pour les ordres programmés
        if not targets_me(s) and not targets_me(order):
            continue
        print(f"[SCHED] {doc.id} -> instant atteint (retard {int(late)}s), execution")
        result = dispatch(order)
        upd = {"status": "done", "result": result, "fired_at": firestore.SERVER_TIMESTAMP}
        doc.reference.update(upd)
        # marquer le signal "open" si l'ouverture a réussi
        if result.get("ok") and str(order.get("type", "")).upper() == "OPEN":
            sigid = str(order.get("signal_id", ""))
            if sigid:
                try:
                    db.collection("signals").document(sigid).set(
                        {"status": "open", "opened_at": firestore.SERVER_TIMESTAMP},
                        merge=True)
                except Exception as e:
                    print(f"        [signal] maj status echec : {e}")
        print(f"        -> {'OK' if result.get('ok') else 'ERR'} {result}")


# ── Détection de fermeture (SL touché / TP atteint) ───────────────

def process_closures(db, firestore, known):
    """Détecte les positions qui viennent de FERMER et notifie si c'est un
    SL touché (perte) ou un TP atteint (gain). Ignore les fermetures manuelles.

    `known` = {ticket: {sl, tp, symbol, type, digits}} mémorisé d'un tour à l'autre.
    Quand un ticket connu disparaît des positions ouvertes, on regarde le dernier
    deal de clôture dans l'historique pour qualifier : proche du SL + perte -> stop,
    proche du TP + gain -> objectif. Sinon (fermeture manuelle) -> pas de notif."""
    with mt5_session() as m:
        if m is None:
            return
        current = {p.ticket: p for p in (m.positions_get() or [])}

        # tickets qui étaient là avant et ne sont plus là = fermés
        closed_tickets = [tk for tk in known if tk not in current]

        if closed_tickets:
            # historique récent pour retrouver le prix/profit de clôture
            deals = m.history_deals_get(datetime.now() - timedelta(days=1), datetime.now()) or []
            by_pos = {}
            for d in deals:
                if getattr(d, "entry", None) in (m.DEAL_ENTRY_OUT, m.DEAL_ENTRY_INOUT, m.DEAL_ENTRY_OUT_BY):
                    by_pos[d.position_id] = d      # dernier deal de sortie pour cette position

            for tk in closed_tickets:
                info = known[tk]
                d = by_pos.get(tk)
                if d is None:
                    continue                       # pas encore dans l'historique, on réessaiera
                exit_price = float(d.price)
                profit = round(float(d.profit), 2)
                sl, tp = info["sl"], info["tp"]
                digits = info["digits"]
                symbol = info["symbol"]
                # tolérance = quelques points autour du niveau
                tol = (10 ** (-digits)) * 30       # ~3 pips
                hit_sl = sl and abs(exit_price - sl) <= tol
                hit_tp = tp and abs(exit_price - tp) <= tol

                kind = None
                if hit_sl and profit <= 0:
                    kind = ("sl", f"{symbol} stoppé à {exit_price} · {profit:+g} €")
                elif hit_tp and profit >= 0:
                    kind = ("tp", f"{symbol} objectif atteint à {exit_price} · {profit:+g} €")
                # sinon : fermeture manuelle -> pas de notif

                if kind:
                    notify(db, firestore, {
                        "type": "close", "event": kind[0],
                        "ticket": tk, "symbol": symbol,
                        "exit_price": exit_price, "profit": profit,
                        "strong": False,
                        "message": kind[1],
                    })
                    print(f"[CLOSE] {kind[1]}")

        # rafraîchir la mémoire avec les positions actuellement ouvertes
        known.clear()
        for tk, p in current.items():
            di = _symbol_ready(m, p.symbol)
            known[tk] = {"sl": p.sl, "tp": p.tp, "symbol": p.symbol,
                         "type": p.type, "digits": di.digits if di else 5}


# ── Trailing opt-in pour trades manuels MT5 ───────────────────────
_optin_cache = {}          # {ticket: (timeframe, expire_ts)}
_OPTIN_TTL = 30            # s

def _trailing_optin(db):
    """Retourne {ticket: timeframe} des positions manuelles que l'utilisateur a
    explicitement activées pour le trailing (collection trailing_optin, active=true).
    Mis en cache 30 s pour limiter les lectures."""
    now = time.time()
    cached = _optin_cache.get("__all__")
    if cached and cached[1] > now:
        return cached[0]
    result = {}
    try:
        for d in db.collection("trailing_optin").where("active", "==", True).stream():
            s = d.to_dict() or {}
            tk = s.get("ticket")
            if tk is not None:
                tf = str(s.get("timeframe", "H4")).upper()
                result[int(tk)] = tf if tf in ("H1", "H4") else "H4"
    except Exception:
        pass
    _optin_cache["__all__"] = (result, now + _OPTIN_TTL)
    return result


# ── Trailing SL (paliers 50/75/95, par position, H1 ou H4) ────────

# Cache léger des timeframes par signal_id, pour ne pas marteler Firestore.
_tf_cache = {}            # {signal_id: (timeframe, expire_ts)}
_TF_CACHE_TTL = 60        # s

def _tf_const(m, tf):
    """Mappe 'H1'/'H4' vers la constante MT5. Défaut H4."""
    return {"H1": m.TIMEFRAME_H1, "H4": m.TIMEFRAME_H4}.get(str(tf).upper(), m.TIMEFRAME_H4)

def _signal_timeframe(db, signal_id):
    """Lit signals/{signal_id}.timeframe ('H1'|'H4'). Défaut H4 si absent.
    Mis en cache 60 s pour limiter les lectures Firestore."""
    if not signal_id:
        return TRAIL_TF_DEFAULT
    now = time.time()
    cached = _tf_cache.get(signal_id)
    if cached and cached[1] > now:
        return cached[0]
    tf = TRAIL_TF_DEFAULT
    try:
        snap = db.collection("signals").document(signal_id).get()
        if snap.exists:
            tf = str((snap.to_dict() or {}).get("timeframe", TRAIL_TF_DEFAULT)).upper()
            if tf not in ("H1", "H4"):
                tf = TRAIL_TF_DEFAULT
    except Exception:
        pass
    _tf_cache[signal_id] = (tf, now + _TF_CACHE_TTL)
    return tf

def _last_closed_bar(m, symbol, tf_const):
    """Dernière bougie FERMÉE du timeframe donné : (time, high, low, close)."""
    rates = m.copy_rates_from_pos(symbol, tf_const, 1, 1)  # index 1 = fermée
    if rates is None or len(rates) == 0:
        return None
    r = rates[0]
    return int(r["time"]), float(r["high"]), float(r["low"]), float(r["close"])

def _better(is_buy, new_sl, cur_sl):
    """Ratchet : un nouveau SL n'est appliqué que s'il protège MIEUX.
    Buy -> SL doit monter. Sell -> SL doit descendre. cur_sl=0 = pas de SL -> accepte."""
    if cur_sl in (None, 0.0):
        return True
    return new_sl > cur_sl if is_buy else new_sl < cur_sl


def process_trailing(db, firestore, state):
    """Trailing PAR POSITION. Chaque position est traitée selon SON timeframe
    (lu dans signals/{signal_id} via le comment ; défaut H4) :
      - H4 -> réévalué au close H4 (toutes les 4h)
      - H1 -> réévalué au close H1 (toutes les heures)
    Au close de la bougie, regarde le high/low (mèche comprise), déduit le palier
    le plus haut franchi (50/75/95%), place le SL (BE/+25%/+50%) si c'est mieux
    (ratchet), et notifie dans Firestore.

    `state` = {ticket: time_de_la_derniere_bougie_traitee} -> 1 éval par bougie
    et par position. Deux positions sur le même symbole mais des TF différents
    sont donc indépendantes."""
    with mt5_session() as m:
        if m is None:
            return
        all_positions = m.positions_get() or []
        optin = _trailing_optin(db)              # {ticket: timeframe} trades manuels activés
        # positions trailées : celles du magic app OU activées manuellement
        positions = [p for p in all_positions
                     if p.magic == MAGIC or p.ticket in optin]
        if not positions:
            return

        for p in positions:
            pe, tp = p.price_open, p.tp
            if not tp or tp == pe:
                continue  # pas de TP -> niveaux non calculables

            # timeframe : opt-in pour les manuels, sinon signals/{signal_id} (via comment)
            if p.magic != MAGIC and p.ticket in optin:
                tf = optin[p.ticket]
            else:
                signal_id = str(p.comment or "")
                tf = _signal_timeframe(db, signal_id)
            tf_const = _tf_const(m, tf)

            bar = _last_closed_bar(m, p.symbol, tf_const)
            if bar is None:
                continue
            bar_time, hi, lo, _close = bar

            # une seule évaluation par bougie ET par position
            key = p.ticket
            if state.get(key) == (tf, bar_time):
                continue
            state[key] = (tf, bar_time)

            info = _symbol_ready(m, p.symbol)
            digits = info.digits if info else 5

            is_buy = (p.type == m.ORDER_TYPE_BUY)
            span = tp - pe                       # signé : >0 buy, <0 sell
            extreme = hi if is_buy else lo       # mèche comprise
            progress = (extreme - pe) / span if span != 0 else 0.0

            hit = next((mc for mc in MARCHES if progress >= mc["seuil"]), None)
            if hit is None:
                continue

            new_sl = round(pe + hit["frac"] * span, digits)
            if not _better(is_buy, new_sl, p.sl):
                continue  # ratchet

            res = m.order_send({
                "action": m.TRADE_ACTION_SLTP, "position": p.ticket,
                "symbol": p.symbol, "sl": new_sl, "tp": p.tp,
            })
            ok = bool(res and res.retcode == m.TRADE_RETCODE_DONE)
            print(f"[TRAIL] #{p.ticket} {p.symbol} [{tf}] prog={progress:.0%} "
                  f"-> {hit['label']} SL={new_sl} {'OK' if ok else 'ERR'}")

            try:
                # message doux : symbole, niveau atteint, nouveau SL
                seuil_pct = int(hit["seuil"] * 100)
                msg = f"{p.symbol} · {seuil_pct}% du chemin · SL → {hit['label']} ({new_sl})"
                if hit["marche"] == 3:
                    msg = f"{p.symbol} · proche de l'objectif (95%) · SL sécurisé à {hit['label']}"
                notify(db, firestore, {
                    "type": "trailing",
                    "ticket": p.ticket, "symbol": p.symbol, "timeframe": tf,
                    "marche": hit["marche"], "label": hit["label"],
                    "new_sl": new_sl, "progress": round(progress, 4),
                    "strong": False,
                    "message": msg,
                    "ok": ok,
                })
            except Exception as e:
                print(f"[TRAIL] notif echec : {e}")


# ── Rappel avant l'ouverture d'une nouvelle bougie H4 ─────────────

PRECLOSE_MIN = int(os.environ.get("PRECLOSE_MIN", "10"))   # minutes avant le close H4 pour notifier
PRECLOSE_SYMBOL = "USDJPY"

def process_preclose_h4(db, firestore, state):
    """Notifie ~PRECLOSE_MIN minutes avant l'ouverture d'une nouvelle bougie H4
    sur USDJPY, pour laisser le temps de décider.

    Anti-bug été/hiver : on ne calcule AUCUN horaire en dur. On demande à MT5
    l'heure d'ouverture de la bougie H4 EN COURS (index 0), et sa fermeture =
    ouverture + 4h. On compare au temps serveur (dernier tick). Ainsi on suit
    le fuseau du broker automatiquement, quel que soit le changement d'heure.

    `state` = {open_time_de_la_bougie_notifiee} -> une seule notif par bougie."""
    with mt5_session() as m:
        if m is None:
            return
        rates = m.copy_rates_from_pos(PRECLOSE_SYMBOL, m.TIMEFRAME_H4, 0, 1)  # bougie EN COURS
        if rates is None or len(rates) == 0:
            return
        open_time = int(rates[0]["time"])          # ouverture de la bougie H4 en cours (temps serveur)
        close_time = open_time + 4 * 3600           # fermeture = +4h (invariable)

        tick = m.symbol_info_tick(PRECLOSE_SYMBOL)
        now_server = int(tick.time) if tick else None
        if now_server is None:
            return

        secs_left = close_time - now_server
        # fenêtre : entre PRECLOSE_MIN minutes et 0 avant la fermeture
        if 0 < secs_left <= PRECLOSE_MIN * 60:
            if state.get("last") == open_time:
                return                              # déjà notifié pour cette bougie
            state["last"] = open_time
            mins = max(1, round(secs_left / 60))
            notify(db, firestore, {
                "type": "preclose", "symbol": PRECLOSE_SYMBOL, "timeframe": "H4",
                "strong": False,
                "message": f"{PRECLOSE_SYMBOL} · nouvelle bougie H4 dans ~{mins} min",
            })
            print(f"[PRECLOSE] notif H4 -{mins}min envoyee")


# ── Ordres conditionnels sur CASSURE (breakout) ───────────────────

def process_breakouts(db, firestore, state):
    """Lit `scheduled` où trigger_type == 'breakout' et status == 'armed'.
    À chaque NOUVEAU close (de la bougie du timeframe de l'ordre) :

      1. Cassure validée ?  buy: close >= niveau  |  sell: close <= niveau
         -> non : on attend le prochain close (l'ordre reste armé tant qu'il
            n'y a pas de cassure ; il sera annulé si le user le veut côté front).

      2. Cassure validée -> selon le mode :
         - 'market' : garde anti-gap |prix_actuel - close| <= GAP_TOL*|TP - close|
              -> OK   : ordre AU MARCHÉ, lot = lot_from_risk(SL) [buffer -5% inclus]
              -> trop loin (gap) : on n'entre pas, on marque 'skipped_gap'
         - 'limit'  : pose le buy_limit/sell_limit avec les prix fournis (entry/SL/TP),
              lot = lot_from_risk(SL).

    Champs attendus du doc scheduled (trigger_type='breakout') :
      direction : 'buy' | 'sell'
      niveau    : prix de référence de la cassure
      mode      : 'market' | 'limit'
      symbol, tp, sl, risk_pct
      entry     : (mode 'limit' uniquement) prix du limit
      timeframe : 'H1' | 'H4'
      signal_id : (optionnel) pour lier au trailing

    `state` = {doc_id: dernier bar_time traité} -> 1 éval par close et par ordre.
    """
    docs = db.collection("scheduled") \
             .where("trigger_type", "==", "breakout") \
             .where("status", "==", "armed").stream()

    with mt5_session() as m:
        if m is None:
            return
        for doc in docs:
            s = doc.to_dict() or {}
            symbol    = str(s.get("symbol", ""))
            direction = str(s.get("direction", "")).lower()
            niveau    = num(s.get("niveau"))
            mode      = str(s.get("mode", "market")).lower()
            tp        = num(s.get("tp"))
            sl        = num(s.get("sl"))
            risk_pct  = num(s.get("risk_pct"))
            tf        = str(s.get("timeframe", "H4")).upper()
            if not symbol or direction not in ("buy", "sell") or niveau <= 0:
                continue

            tf_const = _tf_const(m, tf)
            bar = _last_closed_bar(m, symbol, tf_const)
            if bar is None:
                continue
            bar_time, hi, lo, close = bar

            # une seule évaluation par close et par ordre
            if state.get(doc.id) == bar_time:
                continue
            state[doc.id] = bar_time

            # 1) cassure validée au CLOSE ?
            is_buy = (direction == "buy")
            validated = (close >= niveau) if is_buy else (close <= niveau)
            if not validated:
                continue  # pas encore cassé -> on attend le prochain close

            info = _symbol_ready(m, symbol)
            digits = info.digits if info else 5

            if mode == "market":
                # 2a) garde anti-gap : le prix actuel doit être proche du close
                tick = m.symbol_info_tick(symbol)
                px = (tick.ask if is_buy else tick.bid) if tick else close
                tol = GAP_TOL * abs(tp - close) if tp else 0.0
                if tol > 0 and abs(px - close) > tol:
                    doc.reference.update({
                        "status": "skipped_gap",
                        "reason": f"prix {px} trop loin du close {close} (tol {round(tol,digits)})",
                        "fired_at": firestore.SERVER_TIMESTAMP})
                    print(f"[BREAK] {doc.id} {symbol} cassure OK mais GAP -> non execute")
                    continue
                order = {"type": "OPEN", "action": "BUY" if is_buy else "SELL",
                         "symbol": symbol, "sl": sl, "tp": tp, "risk_pct": risk_pct,
                         "signal_id": s.get("signal_id", "")}
                print(f"[BREAK] {doc.id} {symbol} [{tf}] cassure {direction} au close {close} -> MARCHÉ")
                result = dispatch(order)
            else:
                # 2b) mode limit : pose l'ordre différé avec les prix fournis
                entry = num(s.get("entry"))
                if entry <= 0:
                    doc.reference.update({"status": "error", "reason": "entry limit manquant",
                                          "fired_at": firestore.SERVER_TIMESTAMP})
                    continue
                action = "BUY_LIMIT" if is_buy else "SELL_LIMIT"
                order = {"type": "OPEN", "action": action, "symbol": symbol,
                         "entry": entry, "sl": sl, "tp": tp, "risk_pct": risk_pct,
                         "signal_id": s.get("signal_id", "")}
                print(f"[BREAK] {doc.id} {symbol} [{tf}] cassure {direction} au close {close} -> LIMIT @ {entry}")
                result = dispatch(order)

            ok = bool(result.get("ok"))
            doc.reference.update({
                "status": "triggered" if ok else "error",
                "result": result, "close_at_trigger": close,
                "fired_at": firestore.SERVER_TIMESTAMP})
            # lier le signal au trailing si OPEN réussi
            if ok:
                sigid = str(s.get("signal_id", ""))
                if sigid:
                    try:
                        db.collection("signals").document(sigid).set(
                            {"status": "open", "opened_at": firestore.SERVER_TIMESTAMP}, merge=True)
                    except Exception:
                        pass
            print(f"        -> {'OK' if ok else 'ERR'} {result}")


# ── Journal : sync des trades vers Firestore (anti-doublon par ID) ─

def _upsert_trades(db, deals, status):
    """Upsert dans `trades` avec ID = {OWNER_ID}_{ticket} (merge).
    Anti-doublon garanti : un ticket = un seul doc, à vie. `status` = open/closed."""
    if not OWNER_ID or not deals:
        return 0
    now_iso = datetime.now(timezone.utc).isoformat()
    n = 0
    batch = db.batch()
    for d in deals:
        tk = d.get("ticket")
        if tk is None:
            continue
        ref = db.collection("trades").document(f"{OWNER_ID}_{tk}")
        batch.set(ref, {**d, "ownerId": OWNER_ID, "status": status,
                        "syncedAt": now_iso}, merge=True)
        n += 1
        if n % 400 == 0:          # limite batch Firestore = 500
            batch.commit(); batch = db.batch()
    if n % 400 != 0:
        batch.commit()
    return n

def sync_closed_trades(db):
    """Trades FERMÉS -> trades (1x/jour à 22h). TOUS magics (app + manuels)."""
    with mt5_session() as m:
        if m is None:
            return
        hist = read_history(m, 30)          # 30 derniers jours
    n = _upsert_trades(db, hist, status="closed")
    print(f"[JOURNAL] {n} trade(s) ferme(s) synchronise(s)")

def sync_open_positions(db):
    """Positions EN COURS -> trades (status=open, ~5x/jour). TOUS magics."""
    with mt5_session() as m:
        if m is None:
            return
        poss = m.positions_get() or []
        deals = [{
            "ticket": p.ticket, "time": int(p.time), "symbol": p.symbol,
            "type": "BUY" if p.type == m.ORDER_TYPE_BUY else "SELL",
            "volume": p.volume, "price": p.price_open,
            "profit": round(p.profit, 2), "swap": round(p.swap, 2),
            "commission": 0.0, "comment": p.comment,
        } for p in poss]
    n = _upsert_trades(db, deals, status="open")
    print(f"[JOURNAL] {n} position(s) en cours synchronisee(s)")


# ── Notification centrale : Firestore + push iPhone ───────────────

# titres/emojis par type de notif
def _push_title(payload):
    t = payload.get("type")
    sym = payload.get("symbol", "")
    if t == "trailing":
        return f"🎯 {sym} — SL déplacé"
    if t == "close":
        return f"🔴 {sym} — Stoppé" if payload.get("event") == "sl" else f"🟢 {sym} — Objectif atteint"
    if t == "preclose":
        return f"⏰ {sym} — Bougie H4"
    return sym or "RequinLand"

def _send_push_all(db, title, body, tag=None):
    """Envoie un push web à tous les abonnements de OWNER_ID (comme lib/push.ts)."""
    if not PUSH_ENABLED or not OWNER_ID:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("[PUSH] pywebpush absent — pip install pywebpush")
        return
    import json as _json
    data = _json.dumps({"title": title, "body": body, **({"tag": tag} if tag else {})})
    subs = db.collection("users").document(OWNER_ID).collection("push_subscriptions").stream()
    for doc in subs:
        s = doc.to_dict() or {}
        if not s.get("endpoint"):
            continue
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": s.get("keys", {})},
                data=data,
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={"sub": VAPID_MAILTO},
            )
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            if code in (400, 404, 410):
                # abonnement périmé -> on nettoie
                try: doc.reference.delete()
                except Exception: pass
            else:
                print(f"[PUSH] echec : {e}")
        except Exception as e:
            print(f"[PUSH] echec : {e}")

def notify(db, firestore, payload):
    """Écrit la notif dans Firestore (historique) ET envoie le push iPhone.
    `payload` doit contenir au minimum : type, symbol, message."""
    payload = {**payload, "ts": int(time.time()), "created_at": firestore.SERVER_TIMESTAMP,
               "pushed": True}
    try:
        db.collection("notifications").add(payload)
    except Exception as e:
        print(f"[NOTIF] firestore echec : {e}")
    # push iPhone
    title = _push_title(payload)
    body = payload.get("message", "")
    tag = f"{payload.get('type')}-{payload.get('ticket', payload.get('symbol',''))}"
    _send_push_all(db, title, body, tag=tag)


# ── Boucle principale ─────────────────────────────────────────────

def make_db():
    from google.cloud import firestore
    if not os.path.exists(SA_PATH):
        raise SystemExit(f"[ERREUR] {SA_PATH} introuvable (cle service account Firebase).")
    return firestore.Client.from_service_account_json(SA_PATH)

def run():
    from google.cloud import firestore
    db = make_db()
    print(f"[FIRESTORE] Connecte (sortant). File='orders', statut='vps_status/{VPS_ID}'.")

    processed = set()
    trail_state = {}                 # {ticket: (timeframe, time de la dernière bougie traitée)}
    break_state = {}                 # {doc_id: dernier bar_time traité} pour les cassures
    known_pos = {}                   # {ticket: {sl,tp,symbol,type,digits}} pour détecter les fermetures
    preclose_state = {}              # notif 10 min avant close H4
    t_hb = t_h4 = t_pip = t_sched = t_trail = t_open = 0.0
    last_journal_day = None          # pour ne déclencher la sync 22h qu'une fois par jour

    try:
        publish_pip(db); publish_prices(db); publish_h4(db); publish_status(db)
        print("[PUB] Publication initiale OK.")
    except Exception as e:
        print(f"[PUB] init : {e}")

    while True:
        try:
            # Ordres : réactif (chaque tour, ~5s) — c'est ce qui doit être rapide
            process_orders(db, firestore, processed)
            # Fermetures SL/TP : à chaque tour aussi (un stop peut tomber à tout moment)
            process_closures(db, firestore, known_pos)

            now = time.time()
            # Ordres programmés : pas besoin de 5s, 30s suffit (économie Firestore)
            if now - t_sched >= SCHED_SEC:
                process_scheduled(db, firestore); t_sched = now
            # Trailing : une bougie ne change pas toutes les 5s — 30s suffit
            if now - t_trail >= TRAIL_SEC:
                process_trailing(db, firestore, trail_state)
                process_breakouts(db, firestore, break_state)   # cassures, même cadence (lit les closes)
                process_preclose_h4(db, firestore, preclose_state)  # rappel 10min avant close H4
                t_trail = now

            if now - t_hb >= HEARTBEAT_SEC:
                publish_prices(db); publish_status(db); t_hb = now
            if now - t_h4 >= H4_SEC:
                publish_h4(db); t_h4 = now
            if now - t_pip >= PIP_SEC:
                publish_pip(db); t_pip = now

            # Journal — positions EN COURS toutes les ~5h
            if now - t_open >= OPEN_SYNC_SEC:
                sync_open_positions(db); t_open = now
            # Journal — trades FERMÉS une fois par jour à JOURNAL_HOUR (heure VPS)
            nowdt = datetime.now()
            if nowdt.hour == JOURNAL_HOUR and last_journal_day != nowdt.date():
                sync_closed_trades(db); last_journal_day = nowdt.date()

        except Exception as e:
            print(f"[LOOP] erreur : {e}")

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    run()
