/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "cloud.appwrite.io",
                port: "",
            },
        ],
    },
    transpilePackages: ["yjs", "y-protocols", "lib0", "y-monaco"],
    logging: {
        fetches: {
            fullUrl: false,
        },
        incomingRequests: {
            ignore: [
                /^\/api\/rooms\/.*\/heartbeat/,
                /^\/api\/rooms\/.*\/leave/,
            ],
        },
    },
};

export default nextConfig;
