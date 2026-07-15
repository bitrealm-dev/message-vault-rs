//! Phone normalization for contacts CSV ↔ iMessage E.164 handles.

/// Strip non-digits; drop a leading US country code `1` when 11 digits.
pub fn sanitize_digits(num: &str) -> String {
    let mut digits: String = num.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 11 && digits.starts_with('1') {
        digits = digits[1..].to_string();
    }
    digits
}

/// Format a phone as E.164 when possible (`+1…` for 10-digit US numbers).
/// Returns `None` when there are no digits.
pub fn to_e164(num: &str) -> Option<String> {
    let trimmed = num.trim();
    if trimmed.is_empty() || trimmed.contains('@') {
        return None;
    }
    let digits = sanitize_digits(trimmed);
    if digits.is_empty() {
        return None;
    }
    if digits.len() == 10 {
        Some(format!("+1{digits}"))
    } else {
        Some(format!("+{digits}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn us_formats() {
        assert_eq!(to_e164("(203) 913-5560").as_deref(), Some("+12039135560"));
        assert_eq!(to_e164("+1 812-929-9401").as_deref(), Some("+18129299401"));
        assert_eq!(to_e164("4079679301").as_deref(), Some("+14079679301"));
        assert_eq!(to_e164("+13216632724").as_deref(), Some("+13216632724"));
    }
}
