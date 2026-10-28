/* ===========================================================
   zip.js — 최소 ZIP 생성기 (저장 방식, 압축 없음)
   외부 라이브러리를 쓸 수 없으므로 규격을 직접 쓴다.
   압축을 하지 않는 이유: DEFLATE 를 손으로 구현할 값어치가 없다.
   백업 내용의 대부분은 사진(이미 JPEG)이라 압축률도 어차피 낮다.
   =========================================================== */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** JS Date → DOS 시각/날짜 (2바이트씩) */
function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

class Writer {
  constructor() { this.parts = []; this.len = 0; }
  bytes(u8) { this.parts.push(u8); this.len += u8.length; }
  u16(v) { this.bytes(new Uint8Array([v & 255, (v >>> 8) & 255])); }
  u32(v) { this.bytes(new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255])); }
}

/**
 * @param {Array<{name:string, data:(Uint8Array|string)}>} files
 * @param {Date} when  타임스탬프 (호출하는 쪽에서 넘긴다)
 * @returns {Blob}
 */
export function makeZip(files, when = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosTime(when);
  const out = new Writer();
  const central = [];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const offset = out.len;

    out.u32(0x04034b50);          // 로컬 헤더 서명
    out.u16(20);                  // 필요 버전
    out.u16(0x0800);              // 플래그: 파일명 UTF-8
    out.u16(0);                   // 압축 방식: 저장
    out.u16(time); out.u16(date);
    out.u32(crc);
    out.u32(data.length);         // 압축 크기 = 원본 크기
    out.u32(data.length);
    out.u16(nameBytes.length);
    out.u16(0);                   // extra 없음
    out.bytes(nameBytes);
    out.bytes(data);

    central.push({ nameBytes, crc, size: data.length, offset });
  }

  const cdStart = out.len;
  for (const c of central) {
    out.u32(0x02014b50);          // 중앙 디렉터리 서명
    out.u16(20); out.u16(20);
    out.u16(0x0800);
    out.u16(0);
    out.u16(time); out.u16(date);
    out.u32(c.crc);
    out.u32(c.size); out.u32(c.size);
    out.u16(c.nameBytes.length);
    out.u16(0); out.u16(0);       // extra, comment
    out.u16(0);                   // 시작 디스크
    out.u16(0); out.u32(0);       // 내부/외부 속성
    out.u32(c.offset);
    out.bytes(c.nameBytes);
  }
  const cdSize = out.len - cdStart;

  out.u32(0x06054b50);            // 끝 레코드
  out.u16(0); out.u16(0);
  out.u16(central.length); out.u16(central.length);
  out.u32(cdSize); out.u32(cdStart);
  out.u16(0);

  return new Blob(out.parts, { type: 'application/zip' });
}
