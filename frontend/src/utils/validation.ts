/**
 * Network Configuration Validation Utility
 * Validates IPv4 addresses, subnet masks, and default gateways with specific error messaging.
 */

import { MASK_FOR_CLASS, PREFIX_FOR_CLASS, type AddressClass } from "./api";

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  cleanedValue?: string;
}

/**
 * Class of an IPv4 address by its first octet -- the classful rule itself,
 * with the same boundaries the backend allocator uses
 * (`lab_deploy._class_of_address`): 1-126 is A, 128-191 is B, 192-223 is C,
 * and everything else falls back to C. The two must agree or the canvas would
 * derive one mask and the lab another.
 */
export function addressClassOf(ip: string): AddressClass {
  const first = Number(ip.split(".")[0]);
  if (first >= 1 && first <= 126) return "A";
  if (first >= 128 && first <= 191) return "B";
  if (first >= 192 && first <= 223) return "C";
  return "C";
}

/**
 * The mask that follows from an address, so there is nothing to type:
 * 10.0.0.3 -> 255.0.0.0, 172.16.0.1 -> 255.255.0.0, 192.168.1.1 ->
 * 255.255.255.0. Typing an IP shows this instead of whatever mask was
 * already in the field.
 */
export function classfulMaskFor(ip: string): string {
  return MASK_FOR_CLASS[addressClassOf(ip)];
}

/** True for a value that means "no address": empty, `unassigned`, `no ip`. */
export function isUnassignedIp(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return !trimmed || trimmed === "unassigned" || trimmed === "no ip";
}

/**
 * Checks a typed IP/mask pair once each half has passed its own format
 * check. The designer addresses classfully -- a link's class fixes its mask
 * -- so 10.0.0.3 with 255.255.255.0 is wrong even though both halves are
 * individually well-formed, and that combination used to save silently.
 *
 * A failed format check elsewhere is not this function's business: it reports
 * valid so the format-specific error is the one the user sees.
 */
export function validateIpMaskPair(ip: string, mask: string): ValidationResult {
  const cleanedIp = ip.trim();
  const cleanedMask = mask.trim();
  if (isUnassignedIp(cleanedIp)) return { isValid: true, cleanedValue: cleanedMask };
  if (!validateIPv4(cleanedIp, "IP Address").isValid) {
    return { isValid: true, cleanedValue: cleanedMask };
  }
  if (!validateSubnetMask(cleanedMask).isValid) {
    return { isValid: true, cleanedValue: cleanedMask };
  }
  const addressClass = addressClassOf(cleanedIp);
  const expected = MASK_FOR_CLASS[addressClass];
  if (cleanedMask !== expected) {
    return {
      isValid: false,
      error: `Incorrect Subnet Mask: ${cleanedIp} is a class ${addressClass} address, so its mask must be ${expected} (/${PREFIX_FOR_CLASS[addressClass]}), not ${cleanedMask}. Please rewrite.`,
    };
  }
  return { isValid: true, cleanedValue: cleanedMask };
}

/**
 * Validates standard IPv4 dotted-decimal address (e.g., 192.168.1.1)
 * Rejects values like 222222, 999.999.999.999, negative numbers, non-numeric strings, or invalid octet counts.
 */
export function validateIPv4(
  value: string,
  fieldName = 'IP Address',
  allowUnassigned = false
): ValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    if (allowUnassigned) {
      return { isValid: true, cleanedValue: '' };
    }
    return {
      isValid: false,
      error: `Incorrect ${fieldName}: Value cannot be empty. Please rewrite with a valid IPv4 (e.g. 192.168.1.1).`,
    };
  }

  if (allowUnassigned && (trimmed.toLowerCase() === 'unassigned' || trimmed.toLowerCase() === 'no ip')) {
    return { isValid: true, cleanedValue: 'unassigned' };
  }

  // Must contain only digits and dots
  if (!/^[\d.]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: `Incorrect ${fieldName}: Contains invalid characters. Only numbers and dots are allowed. Please rewrite.`,
    };
  }

  const octets = trimmed.split('.');

  if (octets.length !== 4) {
    return {
      isValid: false,
      error: `Incorrect ${fieldName}: Must have exactly 4 octets separated by dots (e.g. 192.168.1.1). Got "${trimmed}". Please rewrite.`,
    };
  }

  for (let i = 0; i < 4; i++) {
    const octetStr = octets[i];
    if (octetStr === '') {
      return {
        isValid: false,
        error: `Incorrect ${fieldName}: Octet ${i + 1} is empty. Format must be X.X.X.X. Please rewrite.`,
      };
    }

    // Disallow multi-digit leading zeros like "01" (except "0")
    if (octetStr.length > 1 && octetStr.startsWith('0')) {
      return {
        isValid: false,
        error: `Incorrect ${fieldName}: Octet "${octetStr}" has an invalid leading zero. Please rewrite.`,
      };
    }

    const num = Number(octetStr);
    if (isNaN(num) || num < 0 || num > 255) {
      return {
        isValid: false,
        error: `Incorrect ${fieldName}: Octet ${i + 1} (${octetStr}) is out of range. Must be between 0 and 255. Please rewrite.`,
      };
    }
  }

  return { isValid: true, cleanedValue: trimmed };
}

/**
 * Valid standard IPv4 subnet masks (contiguous 1s in binary representation)
 */
const VALID_SUBNET_MASKS = new Set([
  '255.255.255.255', // /32
  '255.255.255.254', // /31
  '255.255.255.252', // /30
  '255.255.255.248', // /29
  '255.255.255.240', // /28
  '255.255.255.224', // /27
  '255.255.255.192', // /26
  '255.255.255.128', // /25
  '255.255.255.0',   // /24
  '255.255.254.0',   // /23
  '255.255.252.0',   // /22
  '255.255.248.0',   // /21
  '255.255.240.0',   // /20
  '255.255.224.0',   // /19
  '255.255.192.0',   // /18
  '255.255.128.0',   // /17
  '255.255.0.0',     // /16
  '255.254.0.0',     // /15
  '255.252.0.0',     // /14
  '255.248.0.0',     // /13
  '255.240.0.0',     // /12
  '255.224.0.0',     // /11
  '255.192.0.0',     // /10
  '255.128.0.0',     // /9
  '255.0.0.0',       // /8
  '254.0.0.0',       // /7
  '252.0.0.0',       // /6
  '248.0.0.0',       // /5
  '240.0.0.0',       // /4
  '224.0.0.0',       // /3
  '192.0.0.0',       // /2
  '128.0.0.0',       // /1
  '0.0.0.0',         // /0
]);

/**
 * Validates that the subnet mask is a legitimate IPv4 subnet mask.
 * Rejects values like 222222, 255.255.255.100, 255.255.0.255, etc.
 */
export function validateSubnetMask(value: string): ValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Incorrect Subnet Mask: Cannot be empty. Common: 255.255.255.0 (/24). Please rewrite.',
    };
  }

  // First check basic IPv4 format
  const basicCheck = validateIPv4(trimmed, 'Subnet Mask');
  if (!basicCheck.isValid) {
    return {
      isValid: false,
      error: `Incorrect Subnet Mask: Invalid format. Must be contiguous mask like 255.255.255.0. Please rewrite.`,
    };
  }

  if (!VALID_SUBNET_MASKS.has(trimmed)) {
    return {
      isValid: false,
      error: `Incorrect Subnet Mask: "${trimmed}" is not a valid contiguous mask. Valid examples: 255.255.255.0, 255.255.0.0, 255.0.0.0. Please rewrite.`,
    };
  }

  return { isValid: true, cleanedValue: trimmed };
}

/**
 * Validates default gateway. Must be 0.0.0.0 or a valid IPv4 address.
 */
export function validateDefaultGateway(value: string): ValidationResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Incorrect Default Gateway: Cannot be empty. Use 0.0.0.0 if unassigned. Please rewrite.',
    };
  }

  const basicCheck = validateIPv4(trimmed, 'Default Gateway');
  if (!basicCheck.isValid) {
    return {
      isValid: false,
      error: `Incorrect Default Gateway: "${trimmed}" is not a valid IPv4. Example: 192.168.1.254 or 0.0.0.0. Please rewrite.`,
    };
  }

  return { isValid: true, cleanedValue: trimmed };
}
