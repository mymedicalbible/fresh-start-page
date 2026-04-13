type CuteSwimmingTurtleProps = {
  className?: string
}

/**
 * SVG cartoon turtle: swims in place with bob, shell sway, flipper paddle, tail wiggle, and blink.
 * Transparent background; animations are CSS keyframes inside the SVG.
 */
export function CuteSwimmingTurtle ({ className }: CuteSwimmingTurtleProps) {
  return (
    <div className={`cute-swimming-turtle inline-block leading-none ${className ?? ''}`.trim()}>
      <svg
        width={300}
        height={230}
        viewBox="0 0 260 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible block max-w-full h-auto"
        aria-hidden
      >
        <style>{`
          .turtle {
            transform-origin: 130px 100px;
            animation: turtleBob 2.6s ease-in-out infinite;
          }

          .shell-group {
            transform-origin: 138px 102px;
            animation: shellSway 2.6s ease-in-out infinite;
          }

          .head-group {
            transform-origin: 72px 94px;
            animation: headBop 2.6s ease-in-out infinite;
          }

          .front-flipper-top {
            transform-origin: 116px 118px;
            animation: frontTopSwim 1.4s ease-in-out infinite;
          }

          .front-flipper-bottom {
            transform-origin: 116px 132px;
            animation: frontBottomSwim 1.4s ease-in-out infinite 0.18s;
          }

          .back-flipper-top {
            transform-origin: 184px 116px;
            animation: backTopSwim 1.4s ease-in-out infinite 0.08s;
          }

          .back-flipper-bottom {
            transform-origin: 186px 136px;
            animation: backBottomSwim 1.4s ease-in-out infinite 0.28s;
          }

          .tail-group {
            transform-origin: 212px 124px;
            animation: tailWiggle 1.4s ease-in-out infinite;
          }

          .eye-open {
            animation: blinkOpen 6.5s infinite;
            transform-origin: center;
          }

          .eye-closed {
            animation: blinkClosed 6.5s infinite;
            transform-origin: center;
          }

          @keyframes turtleBob {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            25% { transform: translateY(-3px) rotate(-1deg); }
            50% { transform: translateY(-10px) rotate(0.5deg); }
            75% { transform: translateY(-2px) rotate(1deg); }
          }

          @keyframes shellSway {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-1deg); }
            50% { transform: rotate(0.6deg); }
            75% { transform: rotate(1deg); }
          }

          @keyframes headBop {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            25% { transform: translateY(-1px) rotate(-1deg); }
            50% { transform: translateY(-2px) rotate(0.5deg); }
            75% { transform: translateY(0px) rotate(1deg); }
          }

          @keyframes frontTopSwim {
            0%, 100% { transform: rotate(22deg) translateY(0px); }
            50% { transform: rotate(-24deg) translateY(3px); }
          }

          @keyframes frontBottomSwim {
            0%, 100% { transform: rotate(-18deg) translateY(0px); }
            50% { transform: rotate(24deg) translateY(-2px); }
          }

          @keyframes backTopSwim {
            0%, 100% { transform: rotate(38deg); }
            50% { transform: rotate(6deg); }
          }

          @keyframes backBottomSwim {
            0%, 100% { transform: rotate(-8deg); }
            50% { transform: rotate(28deg); }
          }

          @keyframes tailWiggle {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(10deg); }
          }

          @keyframes blinkOpen {
            0%, 44%, 48%, 92%, 96%, 100% { opacity: 1; }
            45%, 47%, 93%, 95% { opacity: 0; }
          }

          @keyframes blinkClosed {
            0%, 44%, 48%, 92%, 96%, 100% { opacity: 0; }
            45%, 47%, 93%, 95% { opacity: 1; }
          }
        `}</style>

        <g className="turtle">
          <g className="back-flipper-top">
            <ellipse
              cx="186"
              cy="112"
              rx="22"
              ry="12"
              fill="#7DDC6D"
              stroke="#348C4A"
              strokeWidth="3"
            />
            <ellipse
              cx="194"
              cy="110"
              rx="6"
              ry="3"
              fill="#A7ED84"
              opacity="0.9"
            />
          </g>

          <g className="back-flipper-bottom">
            <ellipse
              cx="188"
              cy="138"
              rx="21"
              ry="11"
              fill="#6FD463"
              stroke="#348C4A"
              strokeWidth="3"
            />
            <ellipse
              cx="196"
              cy="136"
              rx="5"
              ry="3"
              fill="#A7ED84"
              opacity="0.85"
            />
          </g>

          <g className="tail-group">
            <path
              d="M208 121C220 118 227 123 228 129C220 130 214 133 208 139C210 133 210 127 208 121Z"
              fill="#5FBE58"
              stroke="#348C4A"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </g>

          <g className="shell-group">
            <ellipse
              cx="145"
              cy="110"
              rx="56"
              ry="40"
              fill="#D48B43"
              stroke="#7A4A26"
              strokeWidth="4"
            />
            <ellipse
              cx="142"
              cy="106"
              rx="44"
              ry="30"
              fill="#E7A25A"
              opacity="0.95"
            />

            <path
              d="M144 77C136 88 136 128 144 142"
              stroke="#8B552D"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M120 87C128 95 130 122 122 133"
              stroke="#8B552D"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M168 87C160 95 158 122 166 133"
              stroke="#8B552D"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M102 109H187"
              stroke="#8B552D"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M111 89C120 84 131 81 144 81C157 81 169 84 178 89"
              stroke="#8B552D"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M111 130C120 136 131 139 144 139C157 139 169 136 178 130"
              stroke="#8B552D"
              strokeWidth="3"
              strokeLinecap="round"
            />

            <ellipse
              cx="123"
              cy="93"
              rx="12"
              ry="7"
              fill="white"
              opacity="0.22"
              transform="rotate(-18 123 93)"
            />
          </g>

          <ellipse
            cx="132"
            cy="122"
            rx="40"
            ry="22"
            fill="#F3D38A"
            stroke="#348C4A"
            strokeWidth="3"
          />

          <g className="front-flipper-top">
            <ellipse
              cx="112"
              cy="118"
              rx="26"
              ry="14"
              fill="#86E676"
              stroke="#348C4A"
              strokeWidth="3"
            />
            <ellipse
              cx="101"
              cy="116"
              rx="7"
              ry="4"
              fill="#B7F597"
              opacity="0.85"
            />
          </g>

          <g className="front-flipper-bottom">
            <ellipse
              cx="113"
              cy="137"
              rx="24"
              ry="13"
              fill="#78DA6A"
              stroke="#348C4A"
              strokeWidth="3"
            />
            <ellipse
              cx="103"
              cy="135"
              rx="6"
              ry="3.5"
              fill="#B7F597"
              opacity="0.8"
            />
          </g>

          <g className="head-group">
            <ellipse
              cx="72"
              cy="100"
              rx="34"
              ry="30"
              fill="#86E676"
              stroke="#348C4A"
              strokeWidth="4"
            />
            <ellipse
              cx="65"
              cy="92"
              rx="12"
              ry="8"
              fill="white"
              opacity="0.15"
            />

            <ellipse cx="52" cy="112" rx="7" ry="5" fill="#FFB7B2" opacity="0.85" />
            <ellipse cx="83" cy="112" rx="7" ry="5" fill="#FFB7B2" opacity="0.85" />

            <ellipse cx="64" cy="101" rx="1.8" ry="2.2" fill="#348C4A" opacity="0.75" />
            <ellipse cx="70" cy="101" rx="1.8" ry="2.2" fill="#348C4A" opacity="0.75" />

            <g className="eye-open">
              <ellipse cx="57" cy="93" rx="6.8" ry="8.8" fill="#17212B" />
              <ellipse cx="80" cy="93" rx="6.8" ry="8.8" fill="#17212B" />
              <ellipse cx="59" cy="89" rx="2.2" ry="2.8" fill="white" />
              <ellipse cx="82" cy="89" rx="2.2" ry="2.8" fill="white" />
              <ellipse cx="55.5" cy="95.5" rx="1" ry="1.2" fill="white" opacity="0.9" />
              <ellipse cx="78.5" cy="95.5" rx="1" ry="1.2" fill="white" opacity="0.9" />
            </g>

            <g className="eye-closed">
              <path
                d="M51 93C54 90 60 90 63 93"
                stroke="#17212B"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M74 93C77 90 83 90 86 93"
                stroke="#17212B"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>

            <path
              d="M58 108C62 114 74 114 79 107"
              stroke="#A84A3E"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
    </div>
  )
}
