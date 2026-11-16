import { useId } from "react";
import type { ComponentProps } from "react";

import type { AppId } from "#core/apps.ts";

// The icons are v3's, copied as they are: each fills its 24px box to 1px of
// the edge on its longer side, centred on the shorter one.
export const AppIcon = ({
  app,
  ...props
}: { app: AppId } & ComponentProps<"svg">) => {
  // `url(#id)` resolves to the first matching id in the document, so each
  // instance suffixes its own definitions.
  const instanceId = useId().replaceAll(/[^a-zA-Z0-9]/gu, "");

  switch (app) {
    case "gmail": {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          {...props}
        >
          <path
            d="M18.25 5.25003H23V19C23 19.8284 22.3283 20.5 21.5 20.5H19C18.8011 20.5 18.6103 20.421 18.4696 20.2803C18.329 20.1397 18.25 19.9489 18.25 19.75V5.25003Z"
            fill={`url(#paint0_linear_2010_2-${instanceId})`}
          />
          <path
            d="M5.75001 5.25003H1.00002V19C1.00002 19.8284 1.67165 20.5 2.50002 20.5H5.00001C5.19892 20.5 5.38969 20.421 5.53034 20.2803C5.67099 20.1397 5.75001 19.9489 5.75001 19.75V5.25003Z"
            fill="#FC413D"
          />
          <path
            d="M4.90326 3.55703C3.89914 2.71304 2.40102 2.84279 1.55702 3.84691C0.713024 4.8509 0.842774 6.34903 1.8469 7.19315L11.3566 15.1868C11.5368 15.3382 11.7647 15.4213 12.0001 15.4213C12.2355 15.4213 12.4633 15.3382 12.6435 15.1868L22.1532 7.19302C23.1572 6.34903 23.287 4.8509 22.443 3.84678C21.599 2.84278 20.1008 2.71304 19.0968 3.55703L12 9.52252L4.90326 3.55703Z"
            fill={`url(#paint1_linear_2010_2-${instanceId})`}
          />
          <defs>
            <linearGradient
              id={`paint0_linear_2010_2-${instanceId}`}
              x1={20.625}
              y1={5.25003}
              x2={20.625}
              y2={20.5}
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#60D673" />
              <stop offset={0.17} stopColor="#42C868" />
              <stop offset={0.39} stopColor="#0EBC5F" />
              <stop offset={0.62} stopColor="#00A9BB" />
              <stop offset={0.86} stopColor="#3C90FF" />
              <stop offset={1} stopColor="#3186FF" />
            </linearGradient>
            <linearGradient
              id={`paint1_linear_2010_2-${instanceId}`}
              x1={1.00002}
              y1={5.51628}
              x2={23}
              y2={5.51628}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset={0.08} stopColor="#FF63A0" />
              <stop offset={0.3} stopColor="#FC413D" />
              <stop offset={0.5} stopColor="#FC413D" />
              <stop offset={0.65} stopColor="#FC413D" />
              <stop offset={0.72} stopColor="#FC5C30" />
              <stop offset={0.86} stopColor="#FEB10C" />
              <stop offset={0.91} stopColor="#FEC700" />
              <stop offset={0.96} stopColor="#FFDB0F" />
            </linearGradient>
          </defs>
        </svg>
      );
    }
    case "calendar": {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          {...props}
        >
          <path
            fill="#BBE2FF"
            d="M3.658 4.863A3.863 3.863 0 0 1 7.521 1h9.444a3.863 3.863 0 0 1 3.864 3.863v4.078a3.863 3.863 0 0 1-3.864 3.864H7.521A3.863 3.863 0 0 1 3.658 8.94V4.863Z"
          />
          <path
            fill="#3C90FF"
            d="M2.03 6.553A3.488 3.488 0 0 1 5.488 2.61h13.51a3.488 3.488 0 0 1 3.458 3.943l-.822 6.252.822 6.252A3.488 3.488 0 0 1 18.998 23H5.488a3.488 3.488 0 0 1-3.458-3.943l.823-6.252-.823-6.252Z"
          />
          <mask
            id={`a-${instanceId}`}
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
          <g mask={`url(#a-${instanceId})`}>
            <path
              fill={`url(#b-${instanceId})`}
              d="M1.11 23h22.267V12.805H1.11V23Z"
            />
          </g>
          <mask
            id={`c-${instanceId}`}
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
          <g filter={`url(#d-${instanceId})`} mask={`url(#c-${instanceId})`}>
            <path
              fill={`url(#e-${instanceId})`}
              d="M3.658 3.576A2.576 2.576 0 0 1 6.234 1h12.02a2.576 2.576 0 0 1 2.575 2.576v9.229H3.658v-9.23Z"
            />
          </g>
          <path
            fill="#fff"
            d="M9.474 17.813c-.562 0-1.044-.091-1.446-.274a3.09 3.09 0 0 1-1.02-.733c-.275-.31-.47-.614-.583-.911-.115-.297-.16-.477-.137-.541a.278.278 0 0 1 .137-.151l.76-.301a.236.236 0 0 1 .192-.014c.064.018.14.123.226.315.091.192.22.395.384.61.164.206.37.376.603.5.233.119.52.178.863.178.553 0 .991-.16 1.316-.48.328-.32.493-.726.493-1.22 0-.534-.174-.945-.521-1.232-.347-.293-.806-.439-1.377-.439h-.72a.255.255 0 0 1-.178-.068.249.249 0 0 1-.068-.172v-.733a.244.244 0 0 1 .247-.247h.623c.512 0 .923-.139 1.233-.418.31-.278.466-.64.466-1.082 0-.438-.14-.792-.418-1.062-.278-.27-.662-.404-1.15-.404-.275 0-.512.045-.713.137-.2.09-.377.22-.521.383-.143.156-.27.326-.377.508-.105.173-.19.269-.253.287a.245.245 0 0 1-.185-.034l-.72-.35a.23.23 0 0 1-.116-.15c-.019-.069.036-.229.164-.48a3.16 3.16 0 0 1 .603-.78c.27-.268.592-.478.946-.618.36-.146.78-.219 1.26-.219.891 0 1.597.235 2.117.706.521.466.782 1.082.782 1.85 0 .53-.128.989-.384 1.377a2.02 2.02 0 0 1-1.069.822v.028c.557.164.996.466 1.315.904.325.434.487.952.487 1.555 0 .864-.302 1.572-.905 2.124-.602.553-1.388.83-2.356.83Zm6.875-.157a.282.282 0 0 1-.206-.09.302.302 0 0 1-.082-.212V9.735l-1.542 1.11a.235.235 0 0 1-.192.041.263.263 0 0 1-.164-.102l-.445-.63a.266.266 0 0 1-.048-.193.258.258 0 0 1 .11-.17l2.733-1.954a.245.245 0 0 1 .075-.04.213.213 0 0 1 .096-.021h.576c.077 0 .14.027.185.082a.26.26 0 0 1 .075.192v9.304a.29.29 0 0 1-.089.213.27.27 0 0 1-.206.089h-.876Z"
          />
          <defs>
            <linearGradient
              id={`b-${instanceId}`}
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
              id={`e-${instanceId}`}
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
              id={`d-${instanceId}`}
              width={20.39}
              height={15.024}
              x={2.048}
              y={-0.61}
              colorInterpolationFilters="sRGB"
              filterUnits="userSpaceOnUse"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend
                in="SourceGraphic"
                in2="BackgroundImageFix"
                result="shape"
              />
              <feGaussianBlur
                result="effect1_foregroundBlur_2002_2"
                stdDeviation={0.805}
              />
            </filter>
          </defs>
        </svg>
      );
    }
    case "drive": {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          {...props}
        >
          <mask
            id={`mask0_2007_46-${instanceId}`}
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
          <g mask={`url(#mask0_2007_46-${instanceId})`}>
            <path
              d="M26.6823 22.3902H14.5176L12.0003 18.0302L18.0826 7.49512L26.6823 22.3902Z"
              fill={`url(#paint0_linear_2007_46-${instanceId})`}
            />
            <path
              d="M-2.68417 22.3883L5.91552 7.49326V7.49352L3.39912 11.8525H8.43245L14.5153 22.3881L-2.68404 22.3882L-2.68417 22.3883Z"
              fill={`url(#paint1_linear_2007_46-${instanceId})`}
            />
            <path
              d="M12.0009 -3.04192L18.0837 7.49406L15.5669 11.8533H3.40125L12.0009 -3.04192Z"
              fill={`url(#paint2_linear_2007_46-${instanceId})`}
            />
          </g>
          <defs>
            <linearGradient
              id={`paint0_linear_2007_46-${instanceId}`}
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
              id={`paint1_linear_2007_46-${instanceId}`}
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
              id={`paint2_linear_2007_46-${instanceId}`}
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
    case "docs": {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          {...props}
        >
          <mask
            id={`mask0_2007_28-${instanceId}`}
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
          <g mask={`url(#mask0_2007_28-${instanceId})`}>
            <path
              d="M20.3259 23.0833H4.33338V1.08333H12.8334L20.3334 8.58333L20.3259 23.0833Z"
              fill="#3186FF"
            />
            <g filter={`url(#filter0_f_2007_28-${instanceId})`}>
              <path
                d="M5.70839 24.0833H18.9584V2.58333H5.70839V24.0833Z"
                fill={`url(#paint0_linear_2007_28-${instanceId})`}
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
              id={`filter0_f_2007_28-${instanceId}`}
              x={4.20839}
              y={1.08333}
              width={16.25}
              height={24.5}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="BackgroundImageFix"
                result="shape"
              />
              <feGaussianBlur
                stdDeviation={0.75}
                result="effect1_foregroundBlur_2007_28"
              />
            </filter>
            <linearGradient
              id={`paint0_linear_2007_28-${instanceId}`}
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
    case "sheets": {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          {...props}
        >
          <path
            d="M1 9.325C1 8.20712 1 7.64813 1.1755 7.20475C1.30124 6.8872 1.49071 6.59877 1.73223 6.35728C1.97375 6.11578 2.26218 5.92633 2.57975 5.80062C3.02313 5.625 3.582 5.625 4.7 5.625H12.3C13.4179 5.625 13.9769 5.625 14.4202 5.8005C14.7378 5.92622 15.0263 6.11569 15.2678 6.35721C15.5093 6.59873 15.6988 6.88717 15.8245 7.20475C16 7.64813 16 8.207 16 9.325V14.675C16 15.7929 16 16.3519 15.8245 16.7952C15.6988 17.1128 15.5093 17.4013 15.2678 17.6428C15.0263 17.8843 14.7378 18.0738 14.4202 18.1995C13.9769 18.375 13.4179 18.375 12.3 18.375H4.7C3.58212 18.375 3.02312 18.375 2.57962 18.1995C2.26207 18.0738 1.97365 17.8843 1.73215 17.6428C1.49066 17.4013 1.30121 17.1128 1.1755 16.7952C1 16.3519 1 15.7929 1 14.675V9.325Z"
            fill="#009954"
          />
          <mask
            id={`mask0_2007_260-${instanceId}`}
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
          <g mask={`url(#mask0_2007_260-${instanceId})`}>
            <path d="M3 4H23V20H3V4Z" fill="#0EBC5F" />
            <g filter={`url(#filter0_f_2007_260-${instanceId})`}>
              <path
                d="M15.8 18.375H4.2C2.43269 18.375 1 16.9423 1 15.175V8.825C1 7.05769 2.43269 5.625 4.2 5.625H15.8C17.5673 5.625 19 7.05769 19 8.825V15.175C19 16.9423 17.5673 18.375 15.8 18.375Z"
                fill={`url(#paint0_linear_2007_260-${instanceId})`}
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
              id={`filter0_f_2007_260-${instanceId}`}
              x={-0.5}
              y={4.125}
              width={21}
              height={15.75}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="BackgroundImageFix"
                result="shape"
              />
              <feGaussianBlur
                stdDeviation={0.75}
                result="effect1_foregroundBlur_2007_260"
              />
            </filter>
            <linearGradient
              id={`paint0_linear_2007_260-${instanceId}`}
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
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          {...props}
        >
          <path
            d="M1.07739 7.32739C0.750925 5.32879 2.10641 3.444 4.10501 3.11753L16.7712 1.04848C18.7698 0.722151 20.6546 2.07764 20.9811 4.0761L22.9103 15.8866C23.2368 17.8852 21.8813 19.77 19.8827 20.0964L7.21644 22.1655C5.21784 22.4919 3.33304 21.1364 3.00658 19.1379L1.07739 7.32739Z"
            fill={`url(#paint0_linear_2007_207-${instanceId})`}
          />
          <path
            d="M1 7.10241C1 5.93131 1 5.34569 1.18399 4.8812C1.3157 4.54854 1.51417 4.24639 1.76717 3.99339C2.02016 3.7404 2.32231 3.54192 2.65498 3.41021C3.11946 3.22622 3.70495 3.22622 4.87619 3.22622H19.1238C20.2949 3.22622 20.8805 3.22622 21.345 3.41008C21.6777 3.54179 21.9799 3.74028 22.2329 3.9933C22.4859 4.24632 22.6844 4.5485 22.8161 4.8812C23 5.34569 23 5.93131 23 7.10241V16.1119C23 17.283 23 17.8687 22.8161 18.3332C22.6844 18.6659 22.4859 18.968 22.2329 19.2211C21.9799 19.4741 21.6777 19.6726 21.345 19.8043C20.8805 19.9881 20.2949 19.9881 19.1238 19.9881H4.87619C3.70508 19.9881 3.11946 19.9881 2.65485 19.8043C2.32219 19.6725 2.02006 19.474 1.76709 19.221C1.51412 18.968 1.31567 18.6658 1.18399 18.3332C1 17.8687 1 17.283 1 16.1119V7.10241Z"
            fill={`url(#paint1_linear_2007_207-${instanceId})`}
          />
          <mask
            id={`mask0_2007_207-${instanceId}`}
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
          <g mask={`url(#mask0_2007_207-${instanceId})`}>
            <g filter={`url(#filter0_f_2007_207-${instanceId})`}>
              <path
                d="M3.84691 24.1152L22.7559 21.2893L19.5041 -0.469123L0.594971 2.35683L3.84691 24.1152Z"
                fill="#FFBE00"
              />
              <path
                d="M3.84691 24.1152L22.7559 21.2893L19.5041 -0.469123L0.594971 2.35683L3.84691 24.1152Z"
                fill={`url(#paint2_linear_2007_207-${instanceId})`}
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
              id={`filter0_f_2007_207-${instanceId}`}
              x={-0.976458}
              y={-2.04055}
              width={25.3038}
              height={27.7272}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="BackgroundImageFix"
                result="shape"
              />
              <feGaussianBlur
                stdDeviation={0.785714}
                result="effect1_foregroundBlur_2007_207"
              />
            </filter>
            <linearGradient
              id={`paint0_linear_2007_207-${instanceId}`}
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
              id={`paint1_linear_2007_207-${instanceId}`}
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
              id={`paint2_linear_2007_207-${instanceId}`}
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
    case "meet": {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          {...props}
        >
          <path
            d="M13.7519 13.235C12.8983 12.6452 12.8868 11.3878 13.7295 10.7825L20.625 5.83038C21.6175 5.11775 23 5.82563 23 7.0475V16.7669C23 17.9762 21.6424 18.6868 20.6474 17.9993L13.7519 13.235Z"
            fill={`url(#paint0_linear_2007_180-${instanceId})`}
          />
          <path
            d="M1 8.5C1 5.4625 3.4625 3 6.5 3H14.5C15.8807 3 17 4.11925 17 5.5V17.75C17 19.1307 15.8807 20.25 14.5 20.25H3.5C2.11925 20.25 1 19.1307 1 17.75V8.5Z"
            fill={`url(#paint1_radial_2007_180-${instanceId})`}
          />
          <mask
            id={`mask0_2007_180-${instanceId}`}
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
          <g mask={`url(#mask0_2007_180-${instanceId})`}>
            <g filter={`url(#filter0_f_2007_180-${instanceId})`}>
              <path
                d="M9.23825 12.0247L22.9883 4.125V19.625L9.23825 12.0247Z"
                fill={`url(#paint2_linear_2007_180-${instanceId})`}
              />
            </g>
          </g>
          <path
            d="M4.75 18.25C5.7165 18.25 6.5 17.4665 6.5 16.5C6.5 15.5335 5.7165 14.75 4.75 14.75C3.7835 14.75 3 15.5335 3 16.5C3 17.4665 3.7835 18.25 4.75 18.25Z"
            fill="white"
          />
          <defs>
            <filter
              id={`filter0_f_2007_180-${instanceId}`}
              x={5.73825}
              y={0.625}
              width={20.75}
              height={22.5}
              filterUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feFlood floodOpacity={0} result="BackgroundImageFix" />
              <feBlend
                mode="normal"
                in="SourceGraphic"
                in2="BackgroundImageFix"
                result="shape"
              />
              <feGaussianBlur
                stdDeviation={1.75}
                result="effect1_foregroundBlur_2007_180"
              />
            </filter>
            <linearGradient
              id={`paint0_linear_2007_180-${instanceId}`}
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
              id={`paint1_radial_2007_180-${instanceId}`}
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
              id={`paint2_linear_2007_180-${instanceId}`}
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
    // Drawn by hand in the style of the icons around it — the account avatar as
    // Meru renders it, not Google's own artwork.
    default: {
      return null;
    }
  }
};
