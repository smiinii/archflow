import {
  cardPalette,
  resolveCardStyle,
  type CardStyle,
} from "../lib/appearance";
export function CardAppearance({
  value,
  onChange,
}: {
  value?: CardStyle;
  onChange: (style: CardStyle) => void;
}) {
  const style = resolveCardStyle(value);
  return (
    <div className="card-appearance">
      <fieldset>
        <legend>카드 배경색</legend>
        <div className="color-presets">
          {cardPalette.map((c) => (
            <button
              type="button"
              key={c.value}
              aria-label={"배경색 " + c.name}
              aria-pressed={style.backgroundColor === c.value}
              title={c.name + " " + c.value}
              onClick={() => onChange({ ...style, backgroundColor: c.value })}
            >
              <span style={{ backgroundColor: c.value }} />
              {c.name}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="appearance-numbers">
        <label>
          역할 글씨
          <select
            aria-label="역할 글씨 크기"
            value={style.fontSize}
            onChange={(e) =>
              onChange({ ...style, fontSize: Number(e.target.value) })
            }
          >
            {[16, 17, 18].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
        </label>
        <label>
          굵기
          <select
            aria-label="역할 글씨 굵기"
            value={style.fontWeight}
            onChange={(e) =>
              onChange({ ...style, fontWeight: Number(e.target.value) })
            }
          >
            <option value={600}>600 · 굵게</option>
            <option value={700}>700 · 더 굵게</option>
          </select>
        </label>
        <label>
          로고
          <select
            aria-label="로고 크기"
            value={style.iconSize}
            onChange={(e) =>
              onChange({ ...style, iconSize: Number(e.target.value) })
            }
          >
            {[28, 32, 36, 40].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
