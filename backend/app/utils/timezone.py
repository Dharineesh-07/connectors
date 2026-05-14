from datetime import datetime, timedelta, timezone

# India Standard Time (UTC+5:30)
IST_OFFSET = timedelta(hours=5, minutes=30)
IST = timezone(IST_OFFSET)

def get_now():
    """Returns the current aware datetime in IST."""
    return datetime.now(IST)

def get_now_naive():
    """Returns the current naive datetime in IST (useful for DB defaults)."""
    return datetime.now(IST).replace(tzinfo=None)

def utc_to_ist(dt: datetime):
    """Converts a UTC datetime to IST."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)
