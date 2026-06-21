"""Indicator primitives used by the technical & on-chain agents."""
from __future__ import annotations
from typing import List
from .data import Bar


def closes(bars: List[Bar]) -> List[float]:
    return [b.close for b in bars]


def sma(series: List[float], n: int) -> float:
    if len(series) < n:
        return series[-1]
    return sum(series[-n:]) / n


def ema_series(series: List[float], n: int) -> List[float]:
    if not series:
        return []
    k = 2 / (n + 1)
    out = [series[0]]
    for x in series[1:]:
        out.append(out[-1] + k * (x - out[-1]))
    return out


def rsi(series: List[float], n: int = 14) -> float:
    if len(series) < n + 1:
        return 50.0
    gains, losses = 0.0, 0.0
    for i in range(-n, 0):
        ch = series[i] - series[i - 1]
        if ch >= 0:
            gains += ch
        else:
            losses -= ch
    if losses == 0:
        return 100.0
    rs = (gains / n) / (losses / n)
    return 100 - 100 / (1 + rs)


def macd(series: List[float]) -> tuple[float, float, float]:
    if len(series) < 35:
        return 0.0, 0.0, 0.0
    ema12 = ema_series(series, 12)
    ema26 = ema_series(series, 26)
    line = [a - b for a, b in zip(ema12, ema26)]
    sig = ema_series(line, 9)
    return line[-1], sig[-1], line[-1] - sig[-1]


def atr(bars: List[Bar], n: int = 14) -> float:
    if len(bars) < n + 1:
        return bars[-1].close * 0.01
    trs = []
    for i in range(-n, 0):
        b, p = bars[i], bars[i - 1]
        trs.append(max(b.high - b.low, abs(b.high - p.close), abs(b.low - p.close)))
    return sum(trs) / n


def adx(bars: List[Bar], n: int = 14) -> float:
    """Simplified ADX proxy [0,100]."""
    if len(bars) < n + 2:
        return 15.0
    plus_dm, minus_dm, tr_sum = 0.0, 0.0, 0.0
    for i in range(-n, 0):
        b, p = bars[i], bars[i - 1]
        up = b.high - p.high
        dn = p.low - b.low
        plus_dm += up if (up > dn and up > 0) else 0
        minus_dm += dn if (dn > up and dn > 0) else 0
        tr_sum += max(b.high - b.low, abs(b.high - p.close), abs(b.low - p.close))
    if tr_sum == 0:
        return 15.0
    pdi = 100 * plus_dm / tr_sum
    mdi = 100 * minus_dm / tr_sum
    if pdi + mdi == 0:
        return 15.0
    return 100 * abs(pdi - mdi) / (pdi + mdi)


def bb_width(series: List[float], n: int = 20) -> float:
    if len(series) < n:
        return 0.0
    s = series[-n:]
    m = sum(s) / n
    var = sum((x - m) ** 2 for x in s) / n
    sd = var ** 0.5
    return (4 * sd) / m if m else 0.0


def realised_vol(series: List[float], n: int = 24) -> float:
    if len(series) < n + 1:
        return 0.0
    rets = [series[i] / series[i - 1] - 1 for i in range(-n, 0)]
    m = sum(rets) / n
    var = sum((r - m) ** 2 for r in rets) / n
    return var ** 0.5
