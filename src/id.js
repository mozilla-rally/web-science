/**
 * This module provides functionality for generating random identifiers.
 * Studies can use these identifiers to uniquely label events and other
 * items of interest.
 * @module webScience.id
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a random (v4) UUID, consistent with RFC4122. These values
 * include 122 bits of cryptographic randomness.
 * @returns {string} The new UUID.
 */
export function generateId() {
    return uuidv4();
}