import createRateLimitCollection from "./src/models/server/rate-limit.collection";

async function main() {
  try {
    await createRateLimitCollection();
    console.log("rateLimitCollection created successfully!");
  } catch (error) {
    console.error("Error creating rateLimitCollection:", error);
  }
}
main();
