import { Button } from "@meru/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@meru/ui/components/card";
import {
	Empty,
	EmptyContent,
	EmptyHeader,
	EmptyTitle,
} from "@meru/ui/components/empty";
import { Kbd } from "@meru/ui/components/kbd";
import { Skeleton } from "@meru/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import z from "zod";
import { date } from "@/lib/date";

export function VersionHistory() {
	const { data, isPending, isError, refetch } = useQuery({
		queryKey: ["github", "releases"],
		queryFn: async () => {
			const res = await fetch(
				"https://api.github.com/repos/zoidsh/meru/releases",
			).then((res) => res.json());

			return z
				.array(
					z.object({
						published_at: z.string(),
						body: z.string().nullable(),
						tag_name: z.string(),
						id: z.number(),
					}),
				)
				.parse(res);
		},
	});

	if (isPending) {
		return (
			<>
				<Skeleton className="h-64" />
				<Skeleton className="h-64" />
				<Skeleton className="h-64" />
			</>
		);
	}

	if (isError) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Failed to load version history</EmptyTitle>
				</EmptyHeader>
				<EmptyContent>
					<Button
						onClick={() => {
							refetch();
						}}
					>
						Try Again
					</Button>
				</EmptyContent>
			</Empty>
		);
	}

	return data.map((release) => (
		<Card key={release.id}>
			<CardHeader>
				<CardTitle>{release.tag_name}</CardTitle>
				<CardDescription>
					{date(release.published_at).fromNow()}
				</CardDescription>
			</CardHeader>
			<CardContent className="prose dark:prose-invert prose-h3:text-lg prose-li:marker:text-white">
				<Markdown
					rehypePlugins={[rehypeRaw]}
					components={{
						h2: "h3",
						kbd: Kbd,
					}}
				>
					{release.body}
				</Markdown>
			</CardContent>
		</Card>
	));
}
