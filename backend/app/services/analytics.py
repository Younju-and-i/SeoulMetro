def get_insight(on_h: list, off_h: list, netflow: int):
    morning_on = sum(on_h[2:5])     # 07:00 ~ 10:00
    evening_off = sum(off_h[13:16]) # 18:00 ~ 21:00
    
    if evening_off > morning_on and netflow > 0:
        return {
            "type": "유입형 (상업/여가)",
            "desc": "퇴근 후 소비가 집중되는 핵심 상업지입니다.",
            "recommend": ["음식점", "카페", "주점"]
        }
    elif morning_on > evening_off:
        return {
            "type": "유출형 (주거 중심)",
            "desc": "아침 출근 인구가 많은 주거 밀집 지역입니다.",
            "recommend": ["편의점", "세탁소", "베이커리"]
        }
    else:
        return {
            "type": "복합형",
            "desc": "주거와 상업 기능이 혼재된 지역입니다.",
            "recommend": ["브런치 카페", "피트니스", "드럭스토어"]
        }