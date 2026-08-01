-- A null return is meaningful: it says the instrument does not yet have
-- enough feed-consistent history for that period. The legacy trigger treated
-- null as an older worker omission and substituted the nearest available bar,
-- which turned IPO-to-date performance into a mislabeled 90-day or one-year
-- return. The worker now writes all return periods deterministically.

drop trigger if exists fill_screener_return_periods_before_write on public.screener_rows;
