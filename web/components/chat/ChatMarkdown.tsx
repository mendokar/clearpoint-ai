import ReactMarkdown from "react-markdown";

/**
 * Render seguro de las respuestas del asistente: react-markdown no interpreta
 * HTML crudo (skipHtml) y filtra URLs peligrosas (javascript:, data:...).
 */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
