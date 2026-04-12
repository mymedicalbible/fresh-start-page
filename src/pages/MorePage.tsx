import { BackButton } from '../components/BackButton'
import { CorkBoardBackground, StickyNote } from '../components/more'

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page scrap-more-page--hub">
      <div className="scrap-more-hub-back">
        <BackButton fallbackTo="/app" />
      </div>
      <CorkBoardBackground>
        <div className="cork-board__notes">
          <StickyNote
            to="/app/profile"
            title="Account"
            subtitle="Profile & settings"
            variant="account"
          />
          <StickyNote
            to="/app/plushies"
            title="Plushies"
            subtitle="Shop & collect"
            variant="plushies"
          />
        </div>
      </CorkBoardBackground>
      <div className="more-grass-footer" aria-hidden>
        <svg viewBox="0 0 390 130" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Ground base */}
          <ellipse cx="195" cy="122" rx="220" ry="20" fill="#4a7c2f" />
          <ellipse cx="195" cy="120" rx="220" ry="16" fill="#5a9438" />

          {/* Back grass layer */}
          {[15,30,45,58,72,88,102,118,132,148,162,178,192,208,222,238,252,268,282,298,312,328,342,358,372].map((x, i) => (
            <path key={`bg${i}`}
              d={`M${x},115 Q${x+(i%2===0?-5:5)},${95+i%4*3} ${x+(i%3===0?2:-2)},${82+i%5*4}`}
              stroke="#3d6b25" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.7"
            />
          ))}

          {/* Front grass blades */}
          {[10,22,36,50,63,78,92,107,122,137,151,166,180,195,210,224,238,253,267,281,296,310,324,338,352,366,378].map((x, i) => (
            <path key={`fg${i}`}
              d={`M${x},118 Q${x+(i%2===0?-7:7)},${100+i%3*5} ${x+(i%2===0?3:-3)},${88+i%4*6}`}
              stroke="#6abf45" strokeWidth="2" fill="none" strokeLinecap="round"
            />
          ))}

          {/* Tall plant stems */}
          {[65, 145, 195, 265, 325].map((x, i) => (
            <line key={`stem${i}`} x1={x} y1="115" x2={x+(i%2===0?-3:3)} y2={30+i%3*12}
              stroke="#3d6b25" strokeWidth="2.5" strokeLinecap="round" />
          ))}

          {/* Leaves on stems */}
          {[
            [58, 75, -35], [73, 80, 30],
            [138, 65, -30], [152, 72, 28],
            [188, 58, -25], [202, 65, 22],
            [258, 70, -32], [272, 76, 28],
            [318, 68, -28], [332, 74, 25],
          ].map(([x, y, rot], i) => (
            <ellipse key={`leaf${i}`} cx={x} cy={y} rx="12" ry="5"
              fill="#4a8a2e" transform={`rotate(${rot} ${x} ${y})`} opacity="0.9" />
          ))}

          {/* Orange daisy flowers */}
          {[65, 195, 325].map((x, i) => {
            const y = [28, 18, 32][i]
            return (
              <g key={`flower${i}`} transform={`translate(${x},${y})`}>
                {[0,40,80,120,160,200,240,280,320].map((deg, j) => (
                  <ellipse key={j} cx="0" cy="-8" rx="3.5" ry="6"
                    fill="#f97316" transform={`rotate(${deg})`} opacity="0.95" />
                ))}
                <circle cx="0" cy="0" r="5.5" fill="#fbbf24" />
                <circle cx="0" cy="0" r="3" fill="#f59e0b" />
              </g>
            )
          })}

          {/* White dandelion puffs */}
          {[115, 175, 255, 310].map((x, i) => {
            const stemY = 55 + i * 6
            return (
              <g key={`dand${i}`}>
                <line x1={x} y1="115" x2={x} y2={stemY}
                  stroke="#3d6b25" strokeWidth="1.5" strokeLinecap="round" />
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, j) => (
                  <line key={j}
                    x1={x} y1={stemY}
                    x2={x + Math.sin(deg * Math.PI / 180) * 11}
                    y2={stemY - Math.cos(deg * Math.PI / 180) * 11}
                    stroke="white" strokeWidth="1.1" strokeLinecap="round" opacity="0.85"
                  />
                ))}
                <circle cx={x} cy={stemY} r="2.5" fill="white" opacity="0.9" />
              </g>
            )
          })}

          {/* Small white flower clusters */}
          {[40, 145, 230, 355].map((x, i) => (
            <g key={`wf${i}`} transform={`translate(${x}, ${72 + i % 2 * 8})`}>
              {[0, 72, 144, 216, 288].map((deg, j) => (
                <ellipse key={j} cx="0" cy="-5" rx="2.5" ry="4"
                  fill="white" transform={`rotate(${deg})`} opacity="0.9" />
              ))}
              <circle cx="0" cy="0" r="2.5" fill="#fef9c3" />
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
