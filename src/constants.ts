/** Open-Meteo 기준 지역 좌표 (대표 관광·도심 근처) */
export const WEATHER_PLACES = [
  { id: "cebu", name: "세부시티 실시간 날씨", lat: 10.2926, lon: 123.9022 },
  { id: "mactan", name: "막탄 날씨", lat: 10.3072, lon: 123.9617 },
  { id: "oslob", name: "오슬롭 날씨", lat: 9.5033, lon: 123.4311 },
  { id: "moalboal", name: "모알보알 날씨", lat: 9.4753, lon: 123.3829 },
  { id: "bohol", name: "보홀 날씨", lat: 9.5556, lon: 123.7736 },
] as const;

/** 7일 예보는 세부(시티) 기준 */
export const FORECAST_PLACE = WEATHER_PLACES[0];

/** 세부여행플래너 연락·콘텐츠 */
export const PARTNER_LINKS = {
  naverBlog: "https://m.blog.naver.com/aalove0902",
  /** 태풍·악천후 시 호핑·오슬롭 등 대체 일정 안내 글 */
  naverBlogTyphoonTourAlternatives:
    "https://m.blog.naver.com/aalove0902/223935630789",
  kakaoChannel: "https://pf.kakao.com/_xcjmfj/chat",
} as const;

export type TravelTip = {
  title: string;
  body: string;
};

export const TRAVEL_TIPS: TravelTip[] = [
  {
    title: "태풍 우기시즌",
    body: "6-11월은 태풍과 소나기가 잦습니다. 날씨 정보를 확인하는 것이 중요합니다.",
  },
  {
    title: "자외선 더위",
    body: "필리핀은 열대 기후라서 자외선이 매우 강합니다. 선크림이나 모자 선글라스 등을 준비해 오시고 수분 보충은 필수입니다. 피부가 약한 경우 얇은 긴팔을 입는 것도 좋습니다.",
  },
  {
    title: "집중호우",
    body: "갑작스럽게 비가 많이 오는 경우에는 저지대 지역 침수가 되는 경우도 있습니다. 이런 경우에는 가급적 외부 활동을 자제하고 이동해야 하는 경우에는 구글 맵 등을 이용해 도로 상태를 확인하는 것이 좋습니다.",
  },
];

export const SPOTS = [
  { name: "막탄", note: "공항 리조트 호핑투어 마사지 실탄사격" },
  { name: "세부시티", note: "쇼핑몰 야시장 야경" },
  { name: "모알보알", note: "다이빙 바다거북이 정어리떼 화이트비치 캐녀닝 계곡트래킹" },
  { name: "오슬롭", note: "고래상어 원숭이마을 수밀론섬 투말록폭포" },
  { name: "보홀", note: "다이빙 호핑투어 안경원숭이 초코렛힐스 선상크루즈" },
];
