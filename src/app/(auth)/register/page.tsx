"use client";

import "../login/login.css"; // Reuse login styles
import React from "react";
import { useAuthStore } from "@/store/Auth";
import Link from "next/link";
import {
    IconBrandGithub,
    IconBrandGoogle,
    IconCode,
    IconMessageQuestion,
    IconBook2,
    IconBolt,
    IconEye,
    IconEyeOff,
    IconMail,
    IconLock,
    IconCheck,
    IconArrowRight,
    IconUsersGroup,
    IconUser,
} from "@tabler/icons-react";

export default function Register() {
    const { login, createAccount } = useAuthStore();
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [showPassword, setShowPassword] = React.useState(false);
    const [firstname, setFirstname] = React.useState("");
    const [lastname, setLastname] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!firstname || !lastname || !email || !password) {
            setError("Please fill out all fields");
            return;
        }

        setIsLoading(true);
        setError("");

        const response = await createAccount(
            `${firstname} ${lastname}`,
            email,
            password
        );

        if (response.error) {
            setError(response.error.message);
        } else {
            const loginResponse = await login(email, password);
            if (loginResponse.error) {
                setError(loginResponse.error.message);
            }
        }

        setIsLoading(false);
    };

    return (
        <div className="login-page">
            {/* Left Panel - Branding */}
            <div className="login-left-panel">
                <div className="login-left-content">
                    {/* Logo */}
                    <div className="login-logo">
                        <IconCode size={28} className="login-logo-icon" />
                        <span className="login-logo-text">ByteNest</span>
                    </div>

                    {/* Badge */}
                    <div className="login-badge">
                        <span className="login-badge-icon">
                            <IconUsersGroup size={16} />
                        </span>
                        <span>A community for developers</span>
                    </div>

                    {/* Hero Text */}
                    <h1 className="login-hero-title">
                        Where developers
                        <br />
                        <span className="login-hero-highlight">ask</span>,{" "}
                        <span className="login-hero-highlight">share</span>, and{" "}
                        <span className="login-hero-gradient">grow</span>
                    </h1>

                    {/* Subtitle */}
                    <p className="login-hero-subtitle">
                        Join a community of curious minds.
                        <br />
                        Ask questions, share knowledge,
                        <br />
                        and build your reputation.
                    </p>

                    {/* Feature List */}
                    <div className="login-features">
                        <div className="login-feature-item">
                            <div className="login-feature-icon-wrap">
                                <IconMessageQuestion size={22} />
                            </div>
                            <div>
                                <div className="login-feature-title">Ask questions</div>
                                <div className="login-feature-desc">
                                    Get help and answers from experts
                                </div>
                            </div>
                        </div>
                        <div className="login-feature-item">
                            <div className="login-feature-icon-wrap login-feature-icon-purple">
                                <IconBook2 size={22} />
                            </div>
                            <div>
                                <div className="login-feature-title">Share knowledge</div>
                                <div className="login-feature-desc">
                                    Help others and build your reputation
                                </div>
                            </div>
                        </div>
                        <div className="login-feature-item">
                            <div className="login-feature-icon-wrap login-feature-icon-yellow">
                                <IconBolt size={22} />
                            </div>
                            <div>
                                <div className="login-feature-title">Grow together</div>
                                <div className="login-feature-desc">
                                    Learn, collaborate, and level up
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Decorative hero image */}
                <div className="login-decorative">
                    <img
                        src="/images/login-hero.png"
                        alt="Developer desk setup"
                        className="login-hero-image"
                    />
                </div>

                {/* Footer */}
                <div className="login-left-footer">
                    <IconCheck size={16} />
                    <span>A safe and respectful space for everyone.</span>
                </div>

                {/* Ambient glow effects */}
                <div className="login-glow login-glow-1" />
                <div className="login-glow login-glow-2" />
            </div>

            {/* Right Panel - Form */}
            <div className="login-right-panel">
                <div className="login-form-container">
                    <div className="login-form-card">
                        {/* Header */}
                        <div className="login-form-header">
                            <h2 className="login-form-title">Create an account</h2>
                            <p className="login-form-subtitle">
                                Join ByteNest today
                            </p>
                        </div>

                        {/* Social Login Buttons */}
                        <div className="login-social-buttons">
                            <button
                                type="button"
                                className="login-social-btn"
                                disabled={isLoading}
                            >
                                <IconBrandGithub size={20} />
                                <span>Sign up with GitHub</span>
                            </button>
                            <button
                                type="button"
                                className="login-social-btn"
                                disabled={isLoading}
                            >
                                <IconBrandGoogle size={20} className="login-google-icon" />
                                <span>Sign up with Google</span>
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="login-divider">
                            <div className="login-divider-line" />
                            <span className="login-divider-text">or</span>
                            <div className="login-divider-line" />
                        </div>

                        {/* Error */}
                        {error && <div className="login-error">{error}</div>}

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="login-form">
                            <div style={{ display: "flex", gap: "1rem" }}>
                                {/* First Name */}
                                <div className="login-field" style={{ flex: 1 }}>
                                    <label htmlFor="register-firstname" className="login-label">
                                        First Name
                                    </label>
                                    <div className="login-input-wrap">
                                        <IconUser size={18} className="login-input-icon" />
                                        <input
                                            id="register-firstname"
                                            type="text"
                                            placeholder="John"
                                            value={firstname}
                                            onChange={(e) => setFirstname(e.target.value)}
                                            className="login-input"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                                {/* Last Name */}
                                <div className="login-field" style={{ flex: 1 }}>
                                    <label htmlFor="register-lastname" className="login-label">
                                        Last Name
                                    </label>
                                    <div className="login-input-wrap">
                                        <IconUser size={18} className="login-input-icon" />
                                        <input
                                            id="register-lastname"
                                            type="text"
                                            placeholder="Doe"
                                            value={lastname}
                                            onChange={(e) => setLastname(e.target.value)}
                                            className="login-input"
                                            disabled={isLoading}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Email */}
                            <div className="login-field">
                                <label htmlFor="register-email" className="login-label">
                                    Email
                                </label>
                                <div className="login-input-wrap">
                                    <IconMail size={18} className="login-input-icon" />
                                    <input
                                        id="register-email"
                                        type="email"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="login-input"
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="login-field">
                                <label htmlFor="register-password" className="login-label">
                                    Password
                                </label>
                                <div className="login-input-wrap">
                                    <IconLock size={18} className="login-input-icon" />
                                    <input
                                        id="register-password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Create a password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="login-input"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        className="login-password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? (
                                            <IconEye size={18} />
                                        ) : (
                                            <IconEyeOff size={18} />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                className="login-submit-btn"
                                disabled={isLoading}
                            >
                                <span>{isLoading ? "Creating account..." : "Sign Up"}</span>
                                {!isLoading && <IconArrowRight size={18} />}
                            </button>
                        </form>

                        {/* Login Link */}
                        <p className="login-register-link">
                            Already have an account?{" "}
                            <Link href="/login">Login</Link>
                        </p>
                    </div>

                    {/* Footer */}
                    <p className="login-form-footer">
                        By continuing, you agree to our{" "}
                        <a href="#">Terms of Service</a> and{" "}
                        <a href="#">Privacy Policy</a>.
                    </p>
                </div>
            </div>
        </div>
    );
}
