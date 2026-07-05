/** 로컬 dev용 인메모리 태풍 상태 저장소 (Vercel Blob 대체) */

let devTyphoonStatus = null;

/** @returns {object | null} */
export function getDevTyphoonStatus() {
  return devTyphoonStatus;
}

/** @param {object} payload */
export function setDevTyphoonStatus(payload) {
  devTyphoonStatus = payload;
}
