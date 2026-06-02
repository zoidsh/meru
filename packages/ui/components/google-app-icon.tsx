import type { GoogleAppsPinnedApp } from "@meru/shared/types";
import type { ComponentProps } from "react";

export function GoogleAppIcon({
  app,
  ...props
}: { app: GoogleAppsPinnedApp } & ComponentProps<"svg">) {
  switch (app) {
    case "calendar": {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
          <path
            fill="#BBE2FF"
            d="M3.658 4.863A3.863 3.863 0 0 1 7.521 1h9.444a3.863 3.863 0 0 1 3.864 3.863v4.078a3.863 3.863 0 0 1-3.864 3.864H7.521A3.863 3.863 0 0 1 3.658 8.94V4.863Z"
          />
          <path
            fill="#3C90FF"
            d="M2.03 6.553A3.488 3.488 0 0 1 5.488 2.61h13.51a3.488 3.488 0 0 1 3.458 3.943l-.822 6.252.822 6.252A3.488 3.488 0 0 1 18.998 23H5.488a3.488 3.488 0 0 1-3.458-3.943l.823-6.252-.823-6.252Z"
          />
          <mask
            id="a"
            width={21}
            height={21}
            x={2}
            y={2}
            maskUnits="userSpaceOnUse"
            style={{
              maskType: "alpha",
            }}
          >
            <path
              fill="#3C90FF"
              d="M2.03 6.553A3.488 3.488 0 0 1 5.488 2.61h13.51a3.488 3.488 0 0 1 3.458 3.943l-.822 6.252.822 6.252A3.488 3.488 0 0 1 18.998 23H5.488a3.488 3.488 0 0 1-3.458-3.943l.823-6.252-.823-6.252Z"
            />
          </mask>
          <g mask="url(#a)">
            <path fill="url(#b)" d="M1.11 23h22.267V12.805H1.11V23Z" />
          </g>
          <mask
            id="c"
            width={21}
            height={21}
            x={2}
            y={2}
            maskUnits="userSpaceOnUse"
            style={{
              maskType: "alpha",
            }}
          >
            <path
              fill="#3186FF"
              d="M2.03 6.553A3.488 3.488 0 0 1 5.488 2.61h13.51a3.488 3.488 0 0 1 3.458 3.943l-.822 6.252.822 6.252A3.488 3.488 0 0 1 18.998 23H5.488a3.488 3.488 0 0 1-3.458-3.943l.823-6.252-.823-6.252Z"
            />
          </mask>
          <g filter="url(#d)" mask="url(#c)">
            <path
              fill="url(#e)"
              d="M3.658 3.576A2.576 2.576 0 0 1 6.234 1h12.02a2.576 2.576 0 0 1 2.575 2.576v9.229H3.658v-9.23Z"
            />
          </g>
          <path
            fill="#fff"
            d="M9.474 17.813c-.562 0-1.044-.091-1.446-.274a3.09 3.09 0 0 1-1.02-.733c-.275-.31-.47-.614-.583-.911-.115-.297-.16-.477-.137-.541a.278.278 0 0 1 .137-.151l.76-.301a.236.236 0 0 1 .192-.014c.064.018.14.123.226.315.091.192.22.395.384.61.164.206.37.376.603.5.233.119.52.178.863.178.553 0 .991-.16 1.316-.48.328-.32.493-.726.493-1.22 0-.534-.174-.945-.521-1.232-.347-.293-.806-.439-1.377-.439h-.72a.255.255 0 0 1-.178-.068.249.249 0 0 1-.068-.172v-.733a.244.244 0 0 1 .247-.247h.623c.512 0 .923-.139 1.233-.418.31-.278.466-.64.466-1.082 0-.438-.14-.792-.418-1.062-.278-.27-.662-.404-1.15-.404-.275 0-.512.045-.713.137-.2.09-.377.22-.521.383-.143.156-.27.326-.377.508-.105.173-.19.269-.253.287a.245.245 0 0 1-.185-.034l-.72-.35a.23.23 0 0 1-.116-.15c-.019-.069.036-.229.164-.48a3.16 3.16 0 0 1 .603-.78c.27-.268.592-.478.946-.618.36-.146.78-.219 1.26-.219.891 0 1.597.235 2.117.706.521.466.782 1.082.782 1.85 0 .53-.128.989-.384 1.377a2.02 2.02 0 0 1-1.069.822v.028c.557.164.996.466 1.315.904.325.434.487.952.487 1.555 0 .864-.302 1.572-.905 2.124-.602.553-1.388.83-2.356.83Zm6.875-.157a.282.282 0 0 1-.206-.09.302.302 0 0 1-.082-.212V9.735l-1.542 1.11a.235.235 0 0 1-.192.041.263.263 0 0 1-.164-.102l-.445-.63a.266.266 0 0 1-.048-.193.258.258 0 0 1 .11-.17l2.733-1.954a.245.245 0 0 1 .075-.04.213.213 0 0 1 .096-.021h.576c.077 0 .14.027.185.082a.26.26 0 0 1 .075.192v9.304a.29.29 0 0 1-.089.213.27.27 0 0 1-.206.089h-.876Z"
          />
          <defs>
            <linearGradient
              id="b"
              x1={12.243}
              x2={12.243}
              y1={12.805}
              y2={23}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#4FA0FF" />
              <stop offset={1} stopColor="#3186FF" />
            </linearGradient>
            <linearGradient
              id="e"
              x1={11.312}
              x2={11.312}
              y1={2.845}
              y2={12.857}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#A9A8FF" />
              <stop offset={0.8} stopColor="#3C90FF" />
            </linearGradient>
            <filter
              id="d"
              width={20.39}
              height={15.024}
              x={2.048}
              y={-0.61}
              colorInterpolationFilters="sRGB"
              filterUnits="userSpaceOnUse"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur result="effect1_foregroundBlur_2002_2" stdDeviation={0.805} />
            </filter>
          </defs>
        </svg>
      );
    }
    case "chat": {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
          <path fill="#00AF57" d="M16 3H8a6 6 0 1 0 0 12h8a6 6 0 0 0 0-12Z" />
          <path
            fill="#0EBC5F"
            d="M16.625 5.5a6.375 6.375 0 1 1 0 12.75h-4.547l-4.357 2.883c-.483.318-.724.477-.922.49a.75.75 0 0 1-.701-.378C6 21.073 6 20.784 6 20.206v-2.105A6.375 6.375 0 0 1 7.375 5.5h9.25Z"
          />
          <mask
            id="a"
            width={22}
            height={17}
            x={1}
            y={5}
            maskUnits="userSpaceOnUse"
            style={{
              maskType: "alpha",
            }}
          >
            <path
              fill="#0EBC5F"
              d="M16.625 5.5a6.375 6.375 0 1 1 0 12.75H12.09l-4.928 3.237A.75.75 0 0 1 6 20.86v-2.759A6.375 6.375 0 0 1 7.375 5.5h9.25Z"
            />
          </mask>
          <g mask="url(#a)">
            <path fill="#0EBC5F" d="M16 3H8a6 6 0 1 0 0 12h8a6 6 0 0 0 0-12Z" />
            <path fill="url(#b)" d="M16 3H8a6 6 0 1 0 0 12h8a6 6 0 0 0 0-12Z" />
            <path
              stroke="#fff"
              strokeLinecap="round"
              strokeWidth={1.5}
              d="M7.75 11.25S8.855 13.5 12 13.5s4.25-2.148 4.25-2.148"
            />
          </g>
          <defs>
            <linearGradient id="b" x1={12} x2={12} y1={3} y2={15} gradientUnits="userSpaceOnUse">
              <stop offset={0.09} stopColor="#94D4FF" />
              <stop offset={0.28} stopColor="#78C9FF" />
              <stop offset={0.88} stopColor="#01AE58" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "classroom": {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          {...props}
        >
          <mask
            id="mask0_2004_2"
            style={{
              maskType: "luminance",
            }}
            maskUnits="userSpaceOnUse"
            x={1}
            y={3}
            width={22}
            height={19}
          >
            <path
              d="M21.5 3H2.5C1.67125 3 1 3.67125 1 4.5V20.5C1 21.3288 1.67125 22 2.5 22H21.5C22.3288 22 23 21.3288 23 20.5V4.5C23 3.67125 22.3288 3 21.5 3Z"
              fill="white"
            />
          </mask>
          <g mask="url(#mask0_2004_2)">
            <path d="M3 5H21V20H3V5Z" fill="#0F9D58" />
            <path
              d="M16 13C16.6213 13 17.125 12.4963 17.125 11.875C17.125 11.2538 16.6213 10.75 16 10.75C15.3788 10.75 14.875 11.2538 14.875 11.875C14.875 12.4963 15.3788 13 16 13ZM16 13.75C14.795 13.75 13.5 14.3888 13.5 15.1788V16H18.5V15.1788C18.5 14.3888 17.205 13.75 16 13.75ZM8 13C8.62125 13 9.125 12.4963 9.125 11.875C9.125 11.2538 8.62125 10.75 8 10.75C7.37875 10.75 6.875 11.2538 6.875 11.875C6.875 12.4963 7.37875 13 8 13ZM8 13.75C6.795 13.75 5.5 14.3888 5.5 15.1788V16H10.5V15.1788C10.5 14.3888 9.205 13.75 8 13.75Z"
              fill="#57BB8A"
            />
            <path
              d="M12.0013 12C12.8288 12 13.5 11.3288 13.5 10.5C13.5 9.6725 12.8288 9 12.0013 9C11.1725 9 10.5 9.6725 10.5 10.5C10.5 11.3288 11.1725 12 12.0013 12ZM12 13C10.3125 13 8.5 13.895 8.5 15V16H15.5V15C15.5 13.895 13.6875 13 12 13Z"
              fill="#F7F7F7"
            />
            <rect x={13.25} y={18.25} width={6} height={2.52} fill="url(#pattern0_2004_2)" />
            <path d="M14 19H18.5V20H14V19Z" fill="#F1F1F1" />
            <path
              d="M21.5 3H2.5C1.67125 3 1 3.67125 1 4.5V20.5C1 21.3288 1.67125 22 2.5 22H21.5C22.3288 22 23 21.3288 23 20.5V4.5C23 3.67125 22.3288 3 21.5 3ZM21 20H3V5H21V20Z"
              fill="#F4B400"
            />
            <path
              opacity={0.2}
              d="M21.5 3H2.5C1.67125 3 1 3.67125 1 4.5V4.625C1 3.79625 1.67125 3.125 2.5 3.125H21.5C22.3288 3.125 23 3.79625 23 4.625V4.5C23 3.67125 22.3288 3 21.5 3Z"
              fill="white"
            />
            <path
              opacity={0.2}
              d="M21.5 21.875H2.5C1.67125 21.875 1 21.2038 1 20.375V20.5C1 21.3288 1.67125 22 2.5 22H21.5C22.3288 22 23 21.3288 23 20.5V20.375C23 21.2038 22.3288 21.875 21.5 21.875Z"
              fill="#BF360C"
            />
            <path
              d="M18.4925 20H13.9925L15.9913 22H20.4888L18.4925 20Z"
              fill="url(#paint0_linear_2004_2)"
            />
            <path opacity={0.2} d="M3 4.875H21V5H3V4.875Z" fill="#263238" />
          </g>
          <mask
            id="mask1_2004_2"
            style={{
              maskType: "luminance",
            }}
            maskUnits="userSpaceOnUse"
            x={1}
            y={3}
            width={22}
            height={19}
          >
            <path
              d="M21.5 3H2.5C1.67125 3 1 3.67125 1 4.5V20.5C1 21.3288 1.67125 22 2.5 22H21.5C22.3288 22 23 21.3288 23 20.5V4.5C23 3.67125 22.3288 3 21.5 3Z"
              fill="white"
            />
          </mask>
          <g mask="url(#mask1_2004_2)">
            <path opacity={0.2} d="M3 20H21V20.125H3V20Z" fill="white" />
          </g>
          <path
            d="M21.5 3H2.5C1.67125 3 1 3.67125 1 4.5V20.5C1 21.3288 1.67125 22 2.5 22H21.5C22.3288 22 23 21.3288 23 20.5V4.5C23 3.67125 22.3288 3 21.5 3Z"
            fill="url(#paint1_radial_2004_2)"
          />
          <defs>
            <pattern
              id="pattern0_2004_2"
              patternContentUnits="objectBoundingBox"
              width={1}
              height={1}
            >
              <use xlinkHref="#image0_2004_2" transform="scale(0.00490196 0.0113636)" />
            </pattern>
            <linearGradient
              id="paint0_linear_2004_2"
              x1={17.2403}
              y1={20.0278}
              x2={17.2403}
              y2={22.0209}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#BF360C" stopOpacity={0.2} />
              <stop offset={1} stopColor="#BF360C" stopOpacity={0.02} />
            </linearGradient>
            <radialGradient
              id="paint1_radial_2004_2"
              cx={0}
              cy={0}
              r={1}
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(1.75 3.44537) scale(26.2759)"
            >
              <stop stopColor="white" stopOpacity={0.1} />
              <stop offset={1} stopColor="white" stopOpacity={0} />
            </radialGradient>
            <image
              id="image0_2004_2"
              width={204}
              height={88}
              preserveAspectRatio="none"
              xlinkHref="data:image/png;base64,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"
            />
          </defs>
        </svg>
      );
    }
    case "contacts": {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" {...props}>
          <path
            fill="#86A9FF"
            d="M9.756 11.736c-3.916 0-7.084 3.124-7.084 7.04v2.948c0 .704.572 1.276 1.276 1.276h3.388l3.388-11.264h-.968Z"
          />
          <path
            fill="#578CFF"
            d="M21.328 16.356c0-2.552-2.112-4.62-4.664-4.62h-3.388V23h3.388a4.666 4.666 0 0 0 4.664-4.664"
          />
          <path
            fill="#0057CC"
            d="M6.06 16.356c0-2.552 2.112-4.62 4.664-4.62h2.552c2.552 0 4.664 2.068 4.664 4.62v1.98A4.666 4.666 0 0 1 13.276 23h-5.94a1.277 1.277 0 0 1-1.276-1.276v-5.368ZM12 9.747A4.374 4.374 0 1 0 12 1a4.374 4.374 0 0 0 0 8.747Z"
          />
        </svg>
      );
    }
    case "docs": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <mask
            id="mask0_2007_28"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={4}
            y={1}
            width={17}
            height={23}
          >
            <path
              d="M16.6246 23.0833H8.03338C6.91588 23.0833 6.35588 23.0833 5.91338 22.9083C5.59559 22.7826 5.30696 22.5931 5.0653 22.3514C4.82365 22.1098 4.6341 21.8211 4.50838 21.5033C4.33338 21.0596 4.33338 20.5008 4.33338 19.3833V4.78333C4.33338 3.66583 4.33338 3.10583 4.50838 2.66333C4.6341 2.34555 4.82365 2.05691 5.0653 1.81525C5.30696 1.5736 5.59559 1.38406 5.91338 1.25833C6.35588 1.08333 6.91588 1.08333 8.03338 1.08333H12.8334L19.6834 7.93333C19.8896 8.13958 19.9934 8.24333 20.0734 8.36083C20.189 8.53037 20.2685 8.72182 20.3071 8.92333C20.3321 9.06333 20.3321 9.21083 20.3321 9.50833C20.3284 15.6233 20.3259 15.6833 20.3259 19.3796C20.3259 20.4996 20.3259 21.0608 20.1509 21.5046C20.025 21.8221 19.8354 22.1105 19.5938 22.352C19.3521 22.5934 19.0636 22.7828 18.7459 22.9083C18.3021 23.0833 17.7434 23.0833 16.6246 23.0833Z"
              fill="#3186FF"
            />
          </mask>
          <g mask="url(#mask0_2007_28)">
            <path
              d="M20.3259 23.0833H4.33338V1.08333H12.8334L20.3334 8.58333L20.3259 23.0833Z"
              fill="#3186FF"
            />
            <g filter="url(#filter0_f_2007_28)">
              <path
                d="M5.70839 24.0833H18.9584V2.58333H5.70839V24.0833Z"
                fill="url(#paint0_linear_2007_28)"
              />
            </g>
          </g>
          <path
            d="M19.7084 7.95833C19.3946 7.72208 19.0059 7.58333 18.5834 7.58333H14.4334C14.009 7.58333 13.6021 7.41476 13.302 7.1147C13.0019 6.81465 12.8334 6.40768 12.8334 5.98333V1.08333L19.7084 7.95833Z"
            fill="#76BBFF"
          />
          <path
            d="M15.5834 14.3333H9.08338C8.66917 14.3333 8.33338 14.6691 8.33338 15.0833C8.33338 15.4975 8.66917 15.8333 9.08338 15.8333H15.5834C15.9976 15.8333 16.3334 15.4975 16.3334 15.0833C16.3334 14.6691 15.9976 14.3333 15.5834 14.3333Z"
            fill="white"
          />
          <path
            d="M13.5834 17.9583H9.08338C8.66917 17.9583 8.33338 18.2941 8.33338 18.7083C8.33338 19.1225 8.66917 19.4583 9.08338 19.4583H13.5834C13.9976 19.4583 14.3334 19.1225 14.3334 18.7083C14.3334 18.2941 13.9976 17.9583 13.5834 17.9583Z"
            fill="white"
          />
          <defs>
            <filter
              id="filter0_f_2007_28"
              x={4.20839}
              y={1.08333}
              width={16.25}
              height={24.5}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={0.75} result="effect1_foregroundBlur_2007_28" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_28"
              x1={12.3334}
              y1={7.49333}
              x2={7.15964}
              y2={21.5008}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.33} stopColor="#3186FF" />
              <stop offset={1} stopColor="#A9A8FF" />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "drive": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <mask
            id="mask0_2007_46"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={1}
            y={2}
            width={22}
            height={21}
          >
            <path
              d="M7.64317 4.51536C9.57945 1.16161 14.4204 1.16148 16.3567 4.51536L22.3185 14.8415C24.2548 18.1954 21.8343 22.3877 17.9616 22.3877H6.03825C2.16554 22.3877 -0.254877 18.1954 1.68141 14.8415L7.64317 4.51536Z"
              fill="#B43333"
            />
          </mask>
          <g mask="url(#mask0_2007_46)">
            <path
              d="M26.6823 22.3902H14.5176L12.0003 18.0302L18.0826 7.49512L26.6823 22.3902Z"
              fill="url(#paint0_linear_2007_46)"
            />
            <path
              d="M-2.68417 22.3883L5.91552 7.49326V7.49352L3.39912 11.8525H8.43245L14.5153 22.3881L-2.68404 22.3882L-2.68417 22.3883Z"
              fill="url(#paint1_linear_2007_46)"
            />
            <path
              d="M12.0009 -3.04192L18.0837 7.49406L15.5669 11.8533H3.40125L12.0009 -3.04192Z"
              fill="url(#paint2_linear_2007_46)"
            />
          </g>
          <defs>
            <linearGradient
              id="paint0_linear_2007_46"
              x1={24.9209}
              y1={21.5403}
              x2={12.9386}
              y2={14.3398}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.09} stopColor="#FFE921" />
              <stop offset={1} stopColor="#FEC700" />
            </linearGradient>
            <linearGradient
              id="paint1_linear_2007_46"
              x1={14.4359}
              y1={23.6598}
              x2={1.34686}
              y2={15.7417}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.15} stopColor="#A9A8FF" />
              <stop offset={0.33} stopColor="#6D97FF" />
              <stop offset={0.48} stopColor="#3186FF" />
            </linearGradient>
            <linearGradient
              id="paint2_linear_2007_46"
              x1={16.3529}
              y1={4.63186}
              x2={3.0904}
              y2={10.8223}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.55} stopColor="#0EBC5F" />
              <stop offset={0.85} stopColor="#78C9FF" />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "forms": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path
            d="M19.3816 15.4737H11.8553C9.85687 15.4737 8.23685 17.0937 8.23685 19.0921C8.23685 21.0905 9.85687 22.7105 11.8553 22.7105H19.3816C21.38 22.7105 23 21.0905 23 19.0921C23 17.0937 21.38 15.4737 19.3816 15.4737Z"
            fill="#969DFF"
          />
          <path
            d="M8.23684 19.0921C8.23684 17.0937 6.61682 15.4737 4.61842 15.4737C2.62002 15.4737 1 17.0937 1 19.0921C1 21.0905 2.62002 22.7105 4.61842 22.7105C6.61682 22.7105 8.23684 21.0905 8.23684 19.0921Z"
            fill="#B8C0FF"
          />
          <path
            d="M8.23684 11.8553C8.23684 9.85686 6.61682 8.23684 4.61842 8.23684C2.62002 8.23684 1 9.85686 1 11.8553C1 13.8537 2.62002 15.4737 4.61842 15.4737C6.61682 15.4737 8.23684 13.8537 8.23684 11.8553Z"
            fill="#5746E3"
          />
          <path
            d="M19.3816 8.23684H11.8553C9.85687 8.23684 8.23685 9.85686 8.23685 11.8553C8.23685 13.8537 9.85687 15.4737 11.8553 15.4737H19.3816C21.38 15.4737 23 13.8537 23 11.8553C23 9.85686 21.38 8.23684 19.3816 8.23684Z"
            fill="#5746E3"
          />
          <mask
            id="mask0_2007_66"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={8}
            y={1}
            width={15}
            height={8}
          >
            <path
              d="M19.3816 1H11.8553C9.85687 1 8.23685 2.62002 8.23685 4.61842C8.23685 6.61682 9.85687 8.23684 11.8553 8.23684H19.3816C21.38 8.23684 23 6.61682 23 4.61842C23 2.62002 21.38 1 19.3816 1Z"
              fill="#5F54F4"
            />
          </mask>
          <g mask="url(#mask0_2007_66)">
            <path
              d="M19.3816 1H11.8553C9.85687 1 8.23685 2.62002 8.23685 4.61842C8.23685 6.61682 9.85687 8.23684 11.8553 8.23684H19.3816C21.38 8.23684 23 6.61682 23 4.61842C23 2.62002 21.38 1 19.3816 1Z"
              fill="#7372FE"
            />
            <g filter="url(#filter0_f_2007_66)">
              <path
                d="M6.21053 9.82895C9.08822 9.82895 11.4211 7.49612 11.4211 4.61842C11.4211 1.74073 9.08822 -0.592105 6.21053 -0.592105C3.33283 -0.592105 1 1.74073 1 4.61842C1 7.49612 3.33283 9.82895 6.21053 9.82895Z"
                fill="#64AFFF"
              />
            </g>
          </g>
          <path
            d="M8.23684 4.61842C8.23684 2.62002 6.61682 1 4.61842 1C2.62002 1 1 2.62002 1 4.61842C1 6.61682 2.62002 8.23684 4.61842 8.23684C6.61682 8.23684 8.23684 6.61682 8.23684 4.61842Z"
            fill="#7372FE"
          />
          <path
            d="M11.8553 4.61842H19.3816"
            stroke="white"
            strokeWidth={1.73684}
            strokeLinecap="round"
          />
          <path
            d="M4.61842 6.35526C5.57765 6.35526 6.35526 5.57765 6.35526 4.61842C6.35526 3.65919 5.57765 2.88158 4.61842 2.88158C3.65919 2.88158 2.88158 3.65919 2.88158 4.61842C2.88158 5.57765 3.65919 6.35526 4.61842 6.35526Z"
            fill="white"
          />
          <defs>
            <filter
              id="filter0_f_2007_66"
              x={-1.85711}
              y={-3.44921}
              width={16.1353}
              height={16.1353}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={1.42855} result="effect1_foregroundBlur_2007_66" />
            </filter>
          </defs>
        </svg>
      );
    }
    case "gemini": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <g clipPath="url(#clip0_2007_90)">
            <mask
              id="mask0_2007_90"
              style={{
                maskType: "alpha",
              }}
              maskUnits="userSpaceOnUse"
              x={1}
              y={1}
              width={22}
              height={22}
            >
              <path
                d="M11.9821 1C12.2122 1 12.4129 1.15738 12.4691 1.38077C12.6408 2.064 12.8671 2.73235 13.1457 3.37938C13.8741 5.07169 14.8735 6.5528 16.1424 7.82169C17.412 9.09092 18.8928 10.0904 20.5847 10.8188C21.2319 11.0973 21.9004 11.3236 22.5837 11.4954C22.8071 11.5515 22.9641 11.7519 22.9641 11.9821C22.9641 12.2122 22.8071 12.4129 22.5834 12.4691C21.9001 12.6408 21.2318 12.8671 20.5847 13.1457C18.8924 13.8741 17.4117 14.8735 16.1424 16.1424C14.8735 17.412 13.8741 18.8928 13.1457 20.5847C12.867 21.2319 12.6407 21.9004 12.4688 22.5837C12.4416 22.6922 12.3789 22.7886 12.2908 22.8575C12.2026 22.9264 12.094 22.9639 11.9821 22.9641C11.7519 22.9641 11.5515 22.8071 11.4954 22.5834C11.3235 21.9001 11.0972 21.2318 10.8184 20.5847C10.0904 18.8924 9.09126 17.4117 7.82169 16.1424C6.55246 14.8735 5.07169 13.8741 3.37938 13.1457C2.73233 12.867 2.06398 12.6407 1.38077 12.4688C1.27222 12.4416 1.17583 12.3791 1.10685 12.291C1.03788 12.2029 1.00028 12.0943 1 11.9824C1 11.7522 1.15738 11.5519 1.38077 11.4957C2.06401 11.3239 2.73236 11.0975 3.37938 10.8188C5.07169 10.0907 6.5528 9.09126 7.82169 7.82203C9.09092 6.55314 10.0904 5.07203 10.8188 3.37972C11.0973 2.73265 11.3236 2.06431 11.4954 1.38111C11.5224 1.27244 11.585 1.17593 11.6732 1.10688C11.7614 1.03784 11.8701 1.00022 11.9821 1Z"
                fill="black"
              />
              <path
                d="M11.9821 1C12.2122 1 12.4129 1.15738 12.4691 1.38077C12.6408 2.064 12.8671 2.73235 13.1457 3.37938C13.8741 5.07169 14.8735 6.5528 16.1424 7.82169C17.412 9.09092 18.8928 10.0904 20.5847 10.8188C21.2319 11.0973 21.9004 11.3236 22.5837 11.4954C22.8071 11.5515 22.9641 11.7519 22.9641 11.9821C22.9641 12.2122 22.8071 12.4129 22.5834 12.4691C21.9001 12.6408 21.2318 12.8671 20.5847 13.1457C18.8924 13.8741 17.4117 14.8735 16.1424 16.1424C14.8735 17.412 13.8741 18.8928 13.1457 20.5847C12.867 21.2319 12.6407 21.9004 12.4688 22.5837C12.4416 22.6922 12.3789 22.7886 12.2908 22.8575C12.2026 22.9264 12.094 22.9639 11.9821 22.9641C11.7519 22.9641 11.5515 22.8071 11.4954 22.5834C11.3235 21.9001 11.0972 21.2318 10.8184 20.5847C10.0904 18.8924 9.09126 17.4117 7.82169 16.1424C6.55246 14.8735 5.07169 13.8741 3.37938 13.1457C2.73233 12.867 2.06398 12.6407 1.38077 12.4688C1.27222 12.4416 1.17583 12.3791 1.10685 12.291C1.03788 12.2029 1.00028 12.0943 1 11.9824C1 11.7522 1.15738 11.5519 1.38077 11.4957C2.06401 11.3239 2.73236 11.0975 3.37938 10.8188C5.07169 10.0907 6.5528 9.09126 7.82169 7.82203C9.09092 6.55314 10.0904 5.07203 10.8188 3.37972C11.0973 2.73265 11.3236 2.06431 11.4954 1.38111C11.5224 1.27244 11.585 1.17593 11.6732 1.10688C11.7614 1.03784 11.8701 1.00022 11.9821 1Z"
                fill="url(#paint0_linear_2007_90)"
              />
            </mask>
            <g mask="url(#mask0_2007_90)">
              <g filter="url(#filter0_f_2007_90)">
                <path
                  d="M-0.983054 18.1715C1.55473 19.0728 4.47159 17.3829 5.53199 14.397C6.59239 11.4114 5.39458 8.26034 2.85679 7.35902C0.319008 6.45769 -2.59785 8.14763 -3.65859 11.1332C-4.71865 14.1191 -3.52084 17.2702 -0.983054 18.1715Z"
                  fill="#FFE432"
                />
              </g>
              <g filter="url(#filter1_f_2007_90)">
                <path
                  d="M10.285 8.32735C13.7712 8.32735 16.5977 5.43858 16.5977 1.8756C16.5977 -1.68772 13.7715 -4.57615 10.285 -4.57615C6.79853 -4.57615 3.97169 -1.68739 3.97169 1.8756C3.97169 5.43858 6.79819 8.32735 10.285 8.32735Z"
                  fill="#FC413D"
                />
              </g>
              <g filter="url(#filter2_f_2007_90)">
                <path
                  d="M7.83151 28.9596C11.471 28.7819 14.2345 24.8155 14.004 20.1007C13.7739 15.386 10.6363 11.7079 6.99687 11.8859C3.35739 12.064 0.593852 16.0301 0.824345 20.7448C1.05484 25.4596 4.19204 29.1377 7.83151 28.9596Z"
                  fill="#00B95C"
                />
              </g>
              <g filter="url(#filter3_f_2007_90)">
                <path
                  d="M7.83151 28.9596C11.471 28.7819 14.2345 24.8155 14.004 20.1007C13.7739 15.386 10.6363 11.7079 6.99687 11.8859C3.35739 12.064 0.593852 16.0301 0.824345 20.7448C1.05484 25.4596 4.19204 29.1377 7.83151 28.9596Z"
                  fill="#00B95C"
                />
              </g>
              <g filter="url(#filter4_f_2007_90)">
                <path
                  d="M11.4767 26.1074C14.5276 24.251 15.3443 20.0232 13.3007 16.6643C11.2571 13.3051 7.12683 12.087 4.0756 13.9431C1.02437 15.7999 0.207658 20.0276 2.25129 23.3869C4.2956 26.7458 8.4255 27.9639 11.4767 26.1074Z"
                  fill="#00B95C"
                />
              </g>
              <g filter="url(#filter5_f_2007_90)">
                <path
                  d="M23.8093 15.5515C27.2386 15.5515 30.0187 12.8742 30.0187 9.57221C30.0187 6.26985 27.2386 3.59262 23.8093 3.59262C20.38 3.59262 17.5999 6.26985 17.5999 9.57221C17.5999 12.8746 20.38 15.5515 23.8093 15.5515Z"
                  fill="#3186FF"
                />
              </g>
              <g filter="url(#filter6_f_2007_90)">
                <path
                  d="M-3.422 14.858C-0.264149 17.259 4.34874 16.5059 6.88145 13.1751C9.41416 9.84468 8.90782 5.19794 5.74997 2.79689C2.59213 0.395507 -2.02043 1.14858 -4.55347 4.47938C-7.08618 7.80985 -6.5795 12.4569 -3.422 14.858Z"
                  fill="#FBBC04"
                />
              </g>
              <g filter="url(#filter7_f_2007_90)">
                <path
                  d="M12.7582 18.4071C16.5269 20.9983 21.523 20.2767 23.9166 16.7946C26.3105 13.3129 25.1956 8.38997 21.4265 5.79871C17.6574 3.20677 12.6617 3.92905 10.2678 7.41046C7.87415 10.8926 8.98871 15.8155 12.7578 18.4071H12.7582Z"
                  fill="#3186FF"
                />
              </g>
              <g filter="url(#filter8_f_2007_90)">
                <path
                  d="M19.61 0.209353C20.5688 1.51311 19.3365 4.04751 16.858 5.8708C14.3791 7.69409 11.5925 8.11514 10.6336 6.81172C9.67478 5.50763 10.9068 2.97289 13.3853 1.14994C15.8642 -0.673355 18.6511 -1.0944 19.6096 0.209015L19.61 0.209353Z"
                  fill="#749BFF"
                />
              </g>
              <g filter="url(#filter9_f_2007_90)">
                <path
                  d="M11.7384 6.45058C15.5718 2.89471 16.8874 -1.91957 14.6772 -4.30234C12.4671 -6.68511 7.56751 -5.73471 3.73409 -2.17883C-0.0993246 1.37705 -1.41526 6.19132 0.795229 8.57409C3.00538 10.9569 7.90495 10.0065 11.7384 6.45058Z"
                  fill="#FC413D"
                />
              </g>
              <g filter="url(#filter10_f_2007_90)">
                <path
                  d="M3.88032 19.2221C6.15884 20.8528 8.77447 21.1006 9.72284 19.7758C10.6712 18.4507 9.59287 16.0548 7.31435 14.4241C5.03616 12.7934 2.42019 12.5456 1.47216 13.8703C0.523792 15.1954 1.60179 17.5914 3.88032 19.2221Z"
                  fill="#FFEE48"
                />
              </g>
            </g>
          </g>
          <defs>
            <filter
              id="filter0_f_2007_90"
              x={-5.70991}
              y={5.45135}
              width={13.2934}
              height={14.6278}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={0.832615} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter1_f_2007_90"
              x={-4.0776}
              y={-12.6254}
              width={28.7246}
              height={29.0021}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={4.02465} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter2_f_2007_90"
              x={-6.0321}
              y={5.03672}
              width={26.8926}
              height={30.7721}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={3.42151} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter3_f_2007_90"
              x={-6.0321}
              y={5.03672}
              width={26.8926}
              height={30.7721}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={3.42151} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter4_f_2007_90"
              x={-5.71716}
              y={6.23198}
              width={26.9863}
              height={27.5868}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={3.42151} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter5_f_2007_90"
              x={11.0973}
              y={-2.90991}
              width={25.4239}
              height={24.9639}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={3.25126} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter6_f_2007_90"
              x={-12.0589}
              y={-4.50106}
              width={26.4459}
              height={26.6567}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={2.94665} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter7_f_2007_90"
              x={3.74362}
              y={-1.01961}
              width={26.6972}
              height={26.2447}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={2.63154} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter8_f_2007_90"
              x={5.59887}
              y={-5.2576}
              width={19.0458}
              height={17.5359}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={2.35468} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter9_f_2007_90"
              x={-4.25494}
              y={-9.5928}
              width={23.9822}
              height={23.4574}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={1.9888} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <filter
              id="filter10_f_2007_90"
              x={-3.79541}
              y={8.09533}
              width={18.7858}
              height={17.4555}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={2.46163} result="effect1_foregroundBlur_2007_90" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_90"
              x1={7.2436}
              y1={15.696}
              x2={18.6518}
              y2={6.07828}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#4893FC" />
              <stop offset={0.27} stopColor="#4893FC" />
              <stop offset={0.777} stopColor="#969DFF" />
              <stop offset={1} stopColor="#BD99FE" />
            </linearGradient>
            <clipPath id="clip0_2007_90">
              <rect width={22} height={22} fill="white" transform="translate(1 1)" />
            </clipPath>
          </defs>
        </svg>
      );
    }
    case "keep": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <mask
            id="mask0_2007_134"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={3}
            y={1}
            width={18}
            height={18}
          >
            <path
              d="M20.3034 9.65169C20.3034 13.0048 18.3958 15.8786 15.6067 17.3146C14.4213 17.9249 13.0767 18.3034 11.6517 18.3034C10.2266 18.3034 8.88191 17.9249 7.69663 17.3146C4.90757 15.8786 3 13.0048 3 9.65169C3 4.87348 6.87348 1 11.6517 1C16.4299 1 20.3034 4.87348 20.3034 9.65169Z"
              fill="url(#paint0_linear_2007_134)"
            />
          </mask>
          <g mask="url(#mask0_2007_134)">
            <path
              d="M11.6517 18.3034C16.4299 18.3034 20.3034 14.4299 20.3034 9.65169C20.3034 4.87349 16.4299 1 11.6517 1C6.87349 1 3 4.87349 3 9.65169C3 14.4299 6.87349 18.3034 11.6517 18.3034Z"
              fill="url(#paint1_linear_2007_134)"
            />
            <g filter="url(#filter0_f_2007_134)">
              <path
                d="M6.21349 15.3371C6.21349 10.6235 8.04394 7.92135 11.6517 7.92135C15.2594 7.92135 17.0899 10.6235 17.0899 15.3371C17.0899 19.4327 14.6552 22.7528 11.6517 22.7528C8.64819 22.7528 6.21349 19.4327 6.21349 15.3371Z"
                fill="#FDFD6D"
              />
            </g>
            <g filter="url(#filter1_f_2007_134)">
              <path
                d="M7.69662 12.618C7.69662 10.4337 9.46738 8.66292 11.6517 8.66292C13.836 8.66292 15.6067 10.4337 15.6067 12.618V19.0449C15.6067 21.2292 13.836 23 11.6517 23C9.46738 23 7.69662 21.2292 7.69662 19.0449V12.618Z"
                fill="url(#paint2_linear_2007_134)"
              />
            </g>
            <path
              d="M9.42697 15.7079C9.42697 14.8204 10.1463 14.1011 11.0337 14.1011H12.2697C13.1571 14.1011 13.8764 14.8204 13.8764 15.7079C13.8764 16.5953 13.1571 17.3146 12.2697 17.3146H11.0337C10.1463 17.3146 9.42697 16.5953 9.42697 15.7079Z"
              fill="white"
            />
          </g>
          <mask
            id="mask1_2007_134"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={6}
            y={17}
            width={11}
            height={6}
          >
            <path d="M6.70787 17.3146H16.5955V23H6.70787V17.3146Z" fill="#FFBE00" />
          </mask>
          <g mask="url(#mask1_2007_134)">
            <path
              d="M11.6517 6.93258C9.37752 6.93258 7.69662 8.71236 7.69662 11.0854V18.8472C7.69662 21.2202 9.37752 23 11.6517 23C13.9258 23 15.6067 21.2202 15.6067 18.8472V11.0854C15.6067 8.71236 13.9258 6.93258 11.6517 6.93258Z"
              fill="#F6A100"
            />
          </g>
          <defs>
            <filter
              id="filter0_f_2007_134"
              x={-0.905615}
              y={0.802248}
              width={25.1146}
              height={29.0697}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={3.55955} result="effect1_foregroundBlur_2007_134" />
            </filter>
            <filter
              id="filter1_f_2007_134"
              x={6.21348}
              y={7.17978}
              width={10.8764}
              height={17.3034}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={0.741573} result="effect1_foregroundBlur_2007_134" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_134"
              x1={8.66438}
              y1={18.3034}
              x2={19.17}
              y2={1}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.1} stopColor="#FFE921" />
              <stop offset={0.48} stopColor="#FDD313" />
              <stop offset={0.86} stopColor="#FFBE00" />
            </linearGradient>
            <linearGradient
              id="paint1_linear_2007_134"
              x1={11.6517}
              y1={17.3196}
              x2={11.6517}
              y2={1}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.16} stopColor="#FFE921" />
              <stop offset={0.64} stopColor="#FEC700" />
              <stop offset={0.96} stopColor="#FFBE00" />
            </linearGradient>
            <linearGradient
              id="paint2_linear_2007_134"
              x1={11.6517}
              y1={6.33809}
              x2={11.6517}
              y2={17.6718}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.11} stopColor="#FFB8DD" stopOpacity={0} />
              <stop offset={0.68} stopColor="#FFB5E8" />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "meet": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path
            d="M13.7519 13.235C12.8983 12.6452 12.8868 11.3878 13.7295 10.7825L20.625 5.83038C21.6175 5.11775 23 5.82563 23 7.0475V16.7669C23 17.9762 21.6424 18.6868 20.6474 17.9993L13.7519 13.235Z"
            fill="url(#paint0_linear_2007_180)"
          />
          <path
            d="M1 8.5C1 5.4625 3.4625 3 6.5 3H14.5C15.8807 3 17 4.11925 17 5.5V17.75C17 19.1307 15.8807 20.25 14.5 20.25H3.5C2.11925 20.25 1 19.1307 1 17.75V8.5Z"
            fill="url(#paint1_radial_2007_180)"
          />
          <mask
            id="mask0_2007_180"
            style={{
              maskType: "luminance",
            }}
            maskUnits="userSpaceOnUse"
            x={1}
            y={3}
            width={16}
            height={18}
          >
            <path
              d="M1 8.5C1 5.4625 3.4625 3 6.5 3H14.5C15.8807 3 17 4.11925 17 5.5V17.75C17 19.1307 15.8807 20.25 14.5 20.25H3.5C2.11925 20.25 1 19.1307 1 17.75V8.5Z"
              fill="white"
            />
          </mask>
          <g mask="url(#mask0_2007_180)">
            <g filter="url(#filter0_f_2007_180)">
              <path
                d="M9.23825 12.0247L22.9883 4.125V19.625L9.23825 12.0247Z"
                fill="url(#paint2_linear_2007_180)"
              />
            </g>
          </g>
          <path
            d="M4.75 18.25C5.7165 18.25 6.5 17.4665 6.5 16.5C6.5 15.5335 5.7165 14.75 4.75 14.75C3.7835 14.75 3 15.5335 3 16.5C3 17.4665 3.7835 18.25 4.75 18.25Z"
            fill="white"
          />
          <defs>
            <filter
              id="filter0_f_2007_180"
              x={5.73825}
              y={0.625}
              width={20.75}
              height={22.5}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={1.75} result="effect1_foregroundBlur_2007_180" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_180"
              x1={16.1}
              y1={12.68}
              x2={28.4}
              y2={12.68}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#F6A100" />
              <stop offset={1} stopColor="#FFBE00" />
            </linearGradient>
            <radialGradient
              id="paint1_radial_2007_180"
              cx={0}
              cy={0}
              r={1}
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(20.0406 11.625) rotate(180) scale(19.9656 16.9815)"
            >
              <stop offset={0.15} stopColor="#FFE921" />
              <stop offset={1} stopColor="#FEC700" />
            </radialGradient>
            <linearGradient
              id="paint2_linear_2007_180"
              x1={17.0275}
              y1={11.04}
              x2={9.8125}
              y2={11.0237}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.15} stopColor="#FFB5E8" />
              <stop offset={1} stopColor="#FFDBF5" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "notebooklm": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M11.9991 4C5.92433 4 1 8.994 1 15.1577V20.5H3.02767V19.9683C3.02767 17.4677 5.02417 15.4418 7.48817 15.4418C9.95217 15.4418 11.9487 17.4677 11.9487 19.9674V20.5H13.9763V19.9683C13.9763 16.3319 11.0705 13.3867 7.48817 13.3867C6.14361 13.385 4.83283 13.8078 3.74267 14.5948C4.85 12.3618 7.12975 10.8292 9.76333 10.8292C13.4823 10.8292 16.4981 13.889 16.4981 17.6611V20.5H18.5257V17.6611C18.5257 12.7523 14.6024 8.77125 9.76242 8.77125C7.66656 8.76999 5.6415 9.52959 4.0635 10.9089C5.56867 8.02233 8.557 6.05608 12 6.05608C16.9555 6.05608 20.9723 10.1316 20.9723 15.1586V20.5H23V15.1577C22.9991 8.994 18.0747 4 11.9991 4Z"
            fill="currentColor"
          />
        </svg>
      );
    }
    case "tasks": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <mask
            id="mask0_2007_241"
            style={{
              maskType: "luminance",
            }}
            maskUnits="userSpaceOnUse"
            x={1}
            y={1}
            width={22}
            height={22}
          >
            <path d="M1 1H23V23H1V1Z" fill="white" />
          </mask>
          <g mask="url(#mask0_2007_241)">
            <path
              d="M13.2604 6.95833H10.7396C6.6262 6.95833 3.29166 10.2929 3.29166 14.4062C3.29166 18.5196 6.6262 21.8542 10.7396 21.8542H13.2604C17.3738 21.8542 20.7083 18.5196 20.7083 14.4062C20.7083 10.2929 17.3738 6.95833 13.2604 6.95833Z"
              fill="#BBE2FF"
            />
            <path
              d="M13.375 2.60417H10.625C5.9421 2.60417 2.14584 6.40042 2.14584 11.0833V11.5417C2.14584 16.2246 5.9421 20.0208 10.625 20.0208H13.375C18.0579 20.0208 21.8542 16.2246 21.8542 11.5417V11.0833C21.8542 6.40042 18.0579 2.60417 13.375 2.60417Z"
              fill="#3186FF"
            />
            <mask
              id="mask1_2007_241"
              style={{
                maskType: "alpha",
              }}
              maskUnits="userSpaceOnUse"
              x={2}
              y={2}
              width={20}
              height={19}
            >
              <path
                d="M13.375 2.60417H10.625C5.9421 2.60417 2.14584 6.40042 2.14584 11.0833V11.5417C2.14584 16.2246 5.9421 20.0208 10.625 20.0208H13.375C18.0579 20.0208 21.8542 16.2246 21.8542 11.5417V11.0833C21.8542 6.40042 18.0579 2.60417 13.375 2.60417Z"
                fill="#3C90FF"
              />
            </mask>
            <g mask="url(#mask1_2007_241)">
              <g filter="url(#filter0_f_2007_241)">
                <path
                  d="M13.2604 6.95833H10.7396C6.6262 6.95833 3.29166 10.2929 3.29166 14.4062C3.29166 18.5196 6.6262 21.8542 10.7396 21.8542H13.2604C17.3738 21.8542 20.7083 18.5196 20.7083 14.4062C20.7083 10.2929 17.3738 6.95833 13.2604 6.95833Z"
                  fill="url(#paint0_linear_2007_241)"
                />
              </g>
            </g>
            <mask
              id="mask2_2007_241"
              style={{
                maskType: "luminance",
              }}
              maskUnits="userSpaceOnUse"
              x={6}
              y={5}
              width={12}
              height={13}
            >
              <path d="M6.04166 5.35417H17.9583V17.2708H6.04166V5.35417Z" fill="white" />
            </mask>
            <g mask="url(#mask2_2007_241)">
              <path
                d="M7.98959 11.3125L10.5301 13.853C10.6161 13.939 10.7326 13.9872 10.8542 13.9872C10.9757 13.9872 11.0923 13.939 11.1782 13.853L16.8125 8.21875"
                stroke="white"
                strokeWidth={1.375}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
          <defs>
            <filter
              id="filter0_f_2007_241"
              x={1.91666}
              y={5.58333}
              width={20.1667}
              height={17.6458}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={0.6875} result="effect1_foregroundBlur_2007_241" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_241"
              x1={12}
              y1={20.124}
              x2={12.5317}
              y2={8.70573}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.01} stopColor="#A9A8FF" />
              <stop offset={0.79} stopColor="#A9A8FF" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "sheets": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path
            d="M1 9.325C1 8.20712 1 7.64813 1.1755 7.20475C1.30124 6.8872 1.49071 6.59877 1.73223 6.35728C1.97375 6.11578 2.26218 5.92633 2.57975 5.80062C3.02313 5.625 3.582 5.625 4.7 5.625H12.3C13.4179 5.625 13.9769 5.625 14.4202 5.8005C14.7378 5.92622 15.0263 6.11569 15.2678 6.35721C15.5093 6.59873 15.6988 6.88717 15.8245 7.20475C16 7.64813 16 8.207 16 9.325V14.675C16 15.7929 16 16.3519 15.8245 16.7952C15.6988 17.1128 15.5093 17.4013 15.2678 17.6428C15.0263 17.8843 14.7378 18.0738 14.4202 18.1995C13.9769 18.375 13.4179 18.375 12.3 18.375H4.7C3.58212 18.375 3.02312 18.375 2.57962 18.1995C2.26207 18.0738 1.97365 17.8843 1.73215 17.6428C1.49066 17.4013 1.30121 17.1128 1.1755 16.7952C1 16.3519 1 15.7929 1 14.675V9.325Z"
            fill="#009954"
          />
          <mask
            id="mask0_2007_260"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={3}
            y={4}
            width={20}
            height={16}
          >
            <path
              d="M20.5 4H5.5C4.11929 4 3 5.11929 3 6.5V17.5C3 18.8807 4.11929 20 5.5 20H20.5C21.8807 20 23 18.8807 23 17.5V6.5C23 5.11929 21.8807 4 20.5 4Z"
              fill="#0EBC5F"
            />
          </mask>
          <g mask="url(#mask0_2007_260)">
            <path d="M3 4H23V20H3V4Z" fill="#0EBC5F" />
            <g filter="url(#filter0_f_2007_260)">
              <path
                d="M15.8 18.375H4.2C2.43269 18.375 1 16.9423 1 15.175V8.825C1 7.05769 2.43269 5.625 4.2 5.625H15.8C17.5673 5.625 19 7.05769 19 8.825V15.175C19 16.9423 17.5673 18.375 15.8 18.375Z"
                fill="url(#paint0_linear_2007_260)"
              />
            </g>
          </g>
          <path
            d="M10 15.125H20.5M18 17.5V9.5"
            stroke="white"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <defs>
            <filter
              id="filter0_f_2007_260"
              x={-0.5}
              y={4.125}
              width={21}
              height={15.75}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={0.75} result="effect1_foregroundBlur_2007_260" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_260"
              x1={16.28}
              y1={12.9613}
              x2={3.595}
              y2={12.9613}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#0EBC5F" />
              <stop offset={0.95} stopColor="#78C9FF" />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "slides": {
      return (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
          <path
            d="M1.07739 7.32739C0.750925 5.32879 2.10641 3.444 4.10501 3.11753L16.7712 1.04848C18.7698 0.722151 20.6546 2.07764 20.9811 4.0761L22.9103 15.8866C23.2368 17.8852 21.8813 19.77 19.8827 20.0964L7.21644 22.1655C5.21784 22.4919 3.33304 21.1364 3.00658 19.1379L1.07739 7.32739Z"
            fill="url(#paint0_linear_2007_207)"
          />
          <path
            d="M1 7.10241C1 5.93131 1 5.34569 1.18399 4.8812C1.3157 4.54854 1.51417 4.24639 1.76717 3.99339C2.02016 3.7404 2.32231 3.54192 2.65498 3.41021C3.11946 3.22622 3.70495 3.22622 4.87619 3.22622H19.1238C20.2949 3.22622 20.8805 3.22622 21.345 3.41008C21.6777 3.54179 21.9799 3.74028 22.2329 3.9933C22.4859 4.24632 22.6844 4.5485 22.8161 4.8812C23 5.34569 23 5.93131 23 7.10241V16.1119C23 17.283 23 17.8687 22.8161 18.3332C22.6844 18.6659 22.4859 18.968 22.2329 19.2211C21.9799 19.4741 21.6777 19.6726 21.345 19.8043C20.8805 19.9881 20.2949 19.9881 19.1238 19.9881H4.87619C3.70508 19.9881 3.11946 19.9881 2.65485 19.8043C2.32219 19.6725 2.02006 19.474 1.76709 19.221C1.51412 18.968 1.31567 18.6658 1.18399 18.3332C1 17.8687 1 17.283 1 16.1119V7.10241Z"
            fill="url(#paint1_linear_2007_207)"
          />
          <mask
            id="mask0_2007_207"
            style={{
              maskType: "alpha",
            }}
            maskUnits="userSpaceOnUse"
            x={1}
            y={3}
            width={22}
            height={17}
          >
            <path
              d="M1 7.10241C1 5.93131 1 5.34569 1.18399 4.8812C1.3157 4.54854 1.51417 4.24639 1.76717 3.99339C2.02016 3.7404 2.32231 3.54192 2.65498 3.41021C3.11946 3.22622 3.70495 3.22622 4.87619 3.22622H19.1238C20.2949 3.22622 20.8805 3.22622 21.345 3.41008C21.6777 3.54179 21.9799 3.74028 22.2329 3.9933C22.4859 4.24632 22.6844 4.5485 22.8161 4.8812C23 5.34569 23 5.93131 23 7.10241V16.1119C23 17.283 23 17.8687 22.8161 18.3332C22.6844 18.6659 22.4859 18.968 22.2329 19.2211C21.9799 19.4741 21.6777 19.6726 21.345 19.8043C20.8805 19.9881 20.2949 19.9881 19.1238 19.9881H4.87619C3.70508 19.9881 3.11946 19.9881 2.65485 19.8043C2.32219 19.6725 2.02006 19.474 1.76709 19.221C1.51412 18.968 1.31567 18.6658 1.18399 18.3332C1 17.8687 1 17.283 1 16.1119V7.10241Z"
              fill="#FEC700"
            />
          </mask>
          <g mask="url(#mask0_2007_207)">
            <g filter="url(#filter0_f_2007_207)">
              <path
                d="M3.84691 24.1152L22.7559 21.2893L19.5041 -0.469123L0.594971 2.35683L3.84691 24.1152Z"
                fill="#FFBE00"
              />
              <path
                d="M3.84691 24.1152L22.7559 21.2893L19.5041 -0.469123L0.594971 2.35683L3.84691 24.1152Z"
                fill="url(#paint2_linear_2007_207)"
              />
            </g>
          </g>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M18.8095 6.63098C19.0179 6.63098 19.2178 6.71376 19.3651 6.86111C19.5125 7.00846 19.5952 7.20831 19.5952 7.4167V15.7977C19.5952 16.006 19.5125 16.2059 19.3651 16.3532C19.2178 16.5006 19.0179 16.5834 18.8095 16.5834H5.19047L5.15 16.5823C4.94889 16.5719 4.75944 16.4848 4.62076 16.3387C4.48208 16.1927 4.40476 15.999 4.40475 15.7977V7.4167C4.40476 7.21532 4.48208 7.02163 4.62076 6.87561C4.75944 6.7296 4.94889 6.6424 5.15 6.63203L5.19047 6.63098H18.8095ZM5.97618 15.0119H18.0238V8.20241H5.97618V15.0119Z"
            fill="white"
          />
          <defs>
            <filter
              id="filter0_f_2007_207"
              x={-0.976458}
              y={-2.04055}
              width={25.3038}
              height={27.7272}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
              <feGaussianBlur stdDeviation={0.785714} result="effect1_foregroundBlur_2007_207" />
            </filter>
            <linearGradient
              id="paint0_linear_2007_207"
              x1={10.4377}
              y1={2.08301}
              x2={20.0143}
              y2={20.0955}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.2} stopColor="#FFDB0F" />
              <stop offset={0.67} stopColor="#FFBE00" />
              <stop offset={0.91} stopColor="#FFA8E3" />
            </linearGradient>
            <linearGradient
              id="paint1_linear_2007_207"
              x1={12}
              y1={3.22622}
              x2={12}
              y2={19.9881}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FFBE00" />
              <stop offset={1} stopColor="#FEC700" />
            </linearGradient>
            <linearGradient
              id="paint2_linear_2007_207"
              x1={13.6395}
              y1={21.0567}
              x2={10.4233}
              y2={2.34491}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.07} stopColor="#FFF549" />
              <stop offset={0.78} stopColor="#FFBE00" stopOpacity={0} />
            </linearGradient>
          </defs>
        </svg>
      );
    }
  }
}
