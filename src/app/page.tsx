import { StatusApp } from "@/components/status/StatusApp";
import { getStatusSnapshot } from "@/server/status/snapshot";

export const revalidate = 0;

export default async function Home() {
  const snapshot = await getStatusSnapshot();
  return <StatusApp initial={snapshot} />;
}
