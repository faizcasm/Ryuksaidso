
const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, exp: Math.exp,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(expression: string): number {
  const source = expression.replace(/\s+/g, '');
  if (!source) throw new Error('Empty expression');
  let i = 0;
  const peek = () => source[i];

  const parseExpr = (): number => {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = source[i++];
      const right = parseTerm();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = source[i++];
      const right = parseFactor();
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  };

  const parseFactor = (): number => {
    const base = parseUnary();
    if (peek() === '^') {
      i += 1;
      return Math.pow(base, parseFactor());
    }
    return base;
  };

  const parseUnary = (): number => {
    if (peek() === '-') { i += 1; return -parseUnary(); }
    if (peek() === '+') { i += 1; return parseUnary(); }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    if (peek() === '(') {
      i += 1;
      const value = parseExpr();
      if (source[i] !== ')') throw new Error('Missing closing parenthesis');
      i += 1;
      return value;
    }
    const word = /^[a-z]+/i.exec(source.slice(i));
    if (word) {
      const name = word[0].toLowerCase();
      i += name.length;
      if (name in CONSTANTS) return CONSTANTS[name];
      const fn = FUNCTIONS[name];
      if (!fn) throw new Error(`Unknown identifier "${name}" (supported: ${Object.keys(FUNCTIONS).join(', ')}, ${Object.keys(CONSTANTS).join(', ')})`);
      if (source[i] !== '(') throw new Error(`Missing "(" after ${name}`);
      i += 1;
      const arg = parseExpr();
      if (source[i] !== ')') throw new Error('Missing closing parenthesis');
      i += 1;
      return fn(arg);
    }
    const num = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(source.slice(i));
    if (!num) throw new Error(`Unexpected token at position ${i}: "${source.slice(i) || 'end of input'}"`);
    i += num[0].length;
    return parseFloat(num[0]);
  };

  const result = parseExpr();
  if (i < source.length) throw new Error(`Unexpected token at position ${i}: "${source.slice(i)}"`);
  if (!Number.isFinite(result)) throw new Error('Result is not a finite number');
  return result;
}
