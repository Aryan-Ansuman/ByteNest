import { runTopTagsJob } from "@/lib/smells/top-tags-job";

async function main() {
  console.log(JSON.stringify(await runTopTagsJob(), null, 2));
}

main();
