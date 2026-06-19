function requiredPublicEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  appwrite: {
    endpoint: requiredPublicEnv(
      "NEXT_PUBLIC_APPWRITE_HOST_URL",
      process.env.NEXT_PUBLIC_APPWRITE_HOST_URL
    ),
    projectId: requiredPublicEnv(
      "NEXT_PUBLIC_APPWRITE_PROJECT_ID",
      process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
    ),
  },
};

export default env
