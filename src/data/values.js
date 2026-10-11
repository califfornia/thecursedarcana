export const split = (value) => typeof value === 'string' ? value.split('|').map((part) => part.trim()).filter(Boolean) : [];
