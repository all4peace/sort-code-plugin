// Test file for regex handling
export const URL_REGEX = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;

export function validateUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

export class RegexUtils {
  complexRegex(): RegExp {
    // Complex regex with escaped characters
    return /\/\*[\s\S]*?\*\//g;
  }

  conditionalRegex(useStrict: boolean): void {
    const pattern = useStrict ? /^\s*$/ : /\s+/;
    console.log(pattern);
  }

  parseNumbers(text: string): number[] {
    const numberPattern = /\d+/g;
    const matches = text.match(numberPattern);
    return matches ? matches.map(Number) : [];
  }

  replaceSlashes(path: string): string {
    // Replace backslashes with forward slashes
    return path.replace(/\\/g, '/');
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
