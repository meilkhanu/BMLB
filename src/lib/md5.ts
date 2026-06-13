export function md5(str: string): string {
  function r(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
  function q(n: number, c: number, t: number, b: number, x: number, s: number) {
    return r(n + c + t + b + x, s);
  }
  function a(i: number, a: number, b: number, c: number, d: number, s: number, t: number) {
    return q(b & c | ~b & d, a, b, i, t, s);
  }
  function m(i: number, a: number, b: number, c: number, d: number, s: number, t: number) {
    return q(b & d | c & ~d, a, b, i, t, s);
  }
  function p(i: number, a: number, b: number, c: number, d: number, s: number, t: number) {
    return q(b ^ c ^ d, a, b, i, t, s);
  }
  function s(i: number, a: number, b: number, c: number, d: number, s: number, t: number) {
    return q(c ^ (b | ~d), a, b, i, t, s);
  }
  const l = str.length;
  const w = [0];
  for (let i = 0; i < l; i++) w[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
  w[l >> 2] |= 0x80 << ((l % 4) * 8);
  w[((l + 8 >> 6) << 4) + 15] = l * 8;
  let va = 0x67452301, vb = 0xEFCDAB89, vc = 0x98BADCFE, vd = 0x10325476;
  for (let i = 0; i < w.length; i += 16) {
    let aa = va, bb = vb, cc = vc, dd = vd;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) { f = a(w[i+j]||0, aa, bb, cc, dd, [7,12,17,22][j%4], [0xD76AA478,0xE8C7B756,0x242070DB,0xC1BDCEEE,0xF57C0FAF,0x4787C62A,0xA8304613,0xFD469501,0x698098D8,0x8B44F7AF,0xFFFF5BB1,0x895CD7BE,0x6B901122,0xFD987193,0xA679438E,0x49B40821][j]); g = j; }
      else if (j < 32) { f = m(w[i+((5*j+1)%16)]||0, aa, bb, cc, dd, [5,9,14,20][j%4], [0xF61E2562,0xC040B340,0x265E5A51,0xE9B6C7AA,0xD62F105D,0x02441453,0xD8A1E681,0xE7D3FBC8,0x21E1CDE6,0xC33707D6,0xF4D50D87,0x455A14ED,0xA9E3E905,0xFCEFA3F8,0x676F02D9,0x8D2A4C8A][j-16]); g = (5*j+1)%16; }
      else if (j < 48) { f = p(w[i+((3*j+5)%16)]||0, aa, bb, cc, dd, [4,11,16,23][j%4], [0xFFFA3942,0x8771F681,0x6D9D6122,0xFDE5380C,0xA4BEEA44,0x4BDECFA9,0xF6BB4B60,0xBEBFBC70,0x289B7EC6,0xEAA127FA,0xD4EF3085,0x04881D05,0xD9D4D039,0xE6DB99E5,0x1FA27CF8,0xC4AC5665][j-32]); g = (3*j+5)%16; }
      else { f = s(w[i+((7*j)%16)]||0, aa, bb, cc, dd, [6,10,15,21][j%4], [0xF4292244,0x432AFF97,0xAB9423A7,0xFC93A039,0x655B59C3,0x8F0CCC92,0xFFEFF47D,0x85845DD1,0x6FA87E4F,0xFE2CE6E0,0xA3014314,0x4E0811A1,0xF7537E82,0xBD3AF235,0x2AD7D2BB,0xEB86D391][j-48]); g = (7*j)%16; }
      const tmp = dd;
      dd = cc; cc = bb; bb = bb + r(aa + f, [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21][j % 16]); aa = tmp;
    }
    va += aa; vb += bb; vc += cc; vd += dd;
  }
  function h(n: number) { return (n >>> 0).toString(16).padStart(8, '0'); }
  return h(va) + h(vb) + h(vc) + h(vd);
}
