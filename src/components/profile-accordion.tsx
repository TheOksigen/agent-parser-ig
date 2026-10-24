"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ArrowUpRight, LoaderCircle } from "lucide-react";
import { ActionButton } from "./controls";
import { PostCard } from "./post-card";
import type { PostView } from "@/lib/post-view";

type ProfileSummary = {
  id: string;
  username: string;
  count: number;
  active: boolean;
  schedule: string;
  range: string;
  checked: string;
};
export function ProfileAccordion({ profile: p }: { profile: ProfileSummary }) {
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load(cursor?: string) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/profiles/${encodeURIComponent(p.id)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { signal: controller.signal, cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Postlar yüklənmədi.");
      setPosts((current) =>
        cursor
          ? [
              ...(current ?? []),
              ...result.posts.filter(
                (post: PostView) =>
                  !current?.some((item) => item.id === post.id),
              ),
            ]
          : result.posts,
      );
      setNextCursor(result.nextCursor);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "AbortError"
          ? e.message
          : "Sorğu vaxtında tamamlanmadı. Yenidən cəhd edin.",
      );
    } finally {
      clearTimeout(timeout);
      request.current = null;
      setLoading(false);
    }
  }
  return (
    <details
      className="profile-accordion"
      onToggle={(event) => {
        if (event.currentTarget.open && posts === null && !error) void load();
      }}
    >
      <summary>
        <span className="profile-identity">
          <span className="profile-avatar">
            {p.username.slice(0, 2).toUpperCase()}
          </span>
          <strong>@{p.username}</strong>
        </span>
        <span className="profile-post-count">
          {p.count} <span>post</span>
        </span>
        <span className={`status ${p.active ? "green" : "neutral"}`}>
          <span />
          {p.schedule}
        </span>
        <span className="profile-last-checked muted">{p.checked}</span>
        <ChevronDown size={17} className="disclosure-chevron" />
      </summary>
      <div className="profile-expanded">
        <div className="profile-toolbar">
          <div>
            <span className="muted text-small">Toplama aralığı</span>
            <span>{p.range}</span>
          </div>
          <div className="button-row">
            <Link
              className="button secondary small"
              href={`/?profile=${encodeURIComponent(p.username)}`}
            >
              Tarix seç / topla
            </Link>
            <a
              className="button secondary small"
              href={`https://www.instagram.com/${p.username}/`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram <ArrowUpRight size={13} />
            </a>
            <ActionButton
              action="profile-toggle"
              payload={{ id: p.id, active: !p.active }}
            >
              {p.active ? "Dayandır" : "Aktivləşdir"}
            </ActionButton>
          </div>
        </div>
        <p className="profile-posts-label">
          Arxivdəki bütün postlar · ən yeni əvvəl
        </p>
        <div aria-busy={loading}>
          {posts?.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {posts?.length === 0 && (
            <p className="profile-empty muted">
              Hələ paylaşım toplanmayıb. Tarix seçib toplamanı başladın.
            </p>
          )}
        </div>
        <div className="profile-load-state">
          {error && (
            <p className="feedback error" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p role="status">
              <LoaderCircle size={15} className="spin" /> Postlar yüklənir…
            </p>
          ) : error ? (
            <button
              className="button secondary small"
              onClick={() =>
                void load(posts ? (nextCursor ?? undefined) : undefined)
              }
            >
              Yenidən cəhd et
            </button>
          ) : (
            nextCursor && (
              <button
                className="button secondary small"
                onClick={() => void load(nextCursor)}
              >
                Daha 10 post göstər
              </button>
            )
          )}
        </div>
      </div>
    </details>
  );
}
