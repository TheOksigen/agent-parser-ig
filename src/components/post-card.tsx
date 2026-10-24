import { ArrowUpRight } from "lucide-react";
import type { PostView } from "@/lib/post-view";

export function PostCard({ post }: { post: PostView }) {
  return (
    <article className="post-row">
      <div className="post-meta">
        <time dateTime={post.publishedAt}>{post.publishedLabel}</time>
        <a href={post.permalink} target="_blank" rel="noopener noreferrer">
          Instagram-da aç <ArrowUpRight size={13} />
        </a>
        {post.authors.length > 1 && (
          <span className="collab-badge">Collab</span>
        )}
      </div>
      <div className="post-content">
        {post.authors.length > 1 && (
          <p className="post-authors">
            {post.authors.map((name) => (
              <a
                key={name}
                href={`https://www.instagram.com/${name}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                @{name}
              </a>
            ))}
          </p>
        )}
        <p className="caption">
          {post.caption || (
            <em className="muted">Bu paylaşımın təsviri yoxdur.</em>
          )}
        </p>
        {post.hashtags.length > 0 && (
          <div className="hashtags">
            {post.hashtags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        <dl className="post-metrics">
          {post.metrics.map((metric) => (
            <div key={metric.key} title={metric.title}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
        {post.extra.length > 0 && (
          <details className="post-extra">
            <summary>Əlavə məlumatlar</summary>
            <dl>
              {post.extra.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="muted text-small">
              Bütün saxlanmış məlumatlar CSV ixracına daxildir.
            </p>
          </details>
        )}
        <p className="checked">
          Yoxlanılıb: {post.checkedLabel}{" "}
          <span>· — məlumat yoxdur · ≈ təxmini say</span>
        </p>
      </div>
    </article>
  );
}
