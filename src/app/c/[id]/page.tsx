import { redirect } from "next/navigation";
import { Suspense } from "react";

/** Share links from before the database moved to /s/<token>; imported captures keep their old id as the token. */
export default function LegacyShareLink({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense>
      <Redirect params={params} />
    </Suspense>
  );
}

async function Redirect({ params }: Pick<PageProps<"/c/[id]">, "params">): Promise<null> {
  redirect(`/s/${(await params).id}`);
}
