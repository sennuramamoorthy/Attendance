import math

from app.core.config import settings

EARTH_RADIUS_M = 6_371_000


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance in meters between two lat/lng points."""
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def is_within_range(
    student_lat: float, student_lng: float, faculty_lat: float, faculty_lng: float
) -> tuple[bool, int]:
    distance = haversine_distance(student_lat, student_lng, faculty_lat, faculty_lng)
    return distance <= settings.geo_max_distance_meters, round(distance)
