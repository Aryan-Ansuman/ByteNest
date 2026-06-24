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
};

export default nextConfig;
