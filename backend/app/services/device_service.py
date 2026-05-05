def validate_device(
    submitted_fingerprint: str, registered_fingerprint: str | None
) -> tuple[bool, str | None]:
    if not registered_fingerprint:
        return True, None

    if submitted_fingerprint != registered_fingerprint:
        return False, "Device does not match registered device. Contact your Class-in-Charge."

    return True, None
