import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function Home() {
  const host = (await headers()).get("host") ?? "";
  redirect(host.startsWith("demo.") ? "/demo-login" : "/login");
}
