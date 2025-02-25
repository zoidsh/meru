import type { LucideProps } from "lucide-react";

export function MinimizeIcon(props: LucideProps) {
	return (
		<svg fill="currentColor" {...props}>
			<path d="M14 8v1H3V8h11z" />
		</svg>
	);
}

export function RestoreIcon(props: LucideProps) {
	return (
		<svg fill="currentColor" {...props}>
			<path d="M3 5v9h9V5H3zm8 8H4V6h7v7z" />
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M5 5h1V4h7v7h-1v1h2V3H5v2z"
			/>
		</svg>
	);
}

export function MaximizeIcon(props: LucideProps) {
	return (
		<svg fill="currentColor" {...props}>
			<path d="M3 3v10h10V3H3zm9 9H4V4h8v8z" />
		</svg>
	);
}

export function CloseIcon(props: LucideProps) {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" {...props}>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M7.116 8l-4.558 4.558.884.884L8 8.884l4.558 4.558.884-.884L8.884 8l4.558-4.558-.884-.884L8 7.116 3.442 2.558l-.884.884L7.116 8z"
			/>
		</svg>
	);
}
