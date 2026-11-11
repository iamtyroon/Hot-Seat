import React, { useState } from 'react';
import { QrCode, Copy, Check, ExternalLink, Code2 } from 'lucide-react';

interface EmbedAndQrViewProps {
  onOpenDeployStudio: () => void;
}

export const EmbedAndQrView: React.FC<EmbedAndQrViewProps> = ({ onOpenDeployStudio }) => {
  const [copied, setCopied] = useState(false);
  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://hotseat.demo';
  const embedUrl = `${appOrigin}/?embed=1`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="540" style="border:0;border-radius:8px;overflow:hidden;" title="Hot Seat Live AI Agent Billboard"></iframe>`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(iframeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Deterministic 21x21 QR-style finder matrix for on-screen presentation
  const qrSize = 21;
  const isFinderCell = (r: number, c: number) => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= qrSize - 7;
    const inBottomLeft = r >= qrSize - 7 && c < 7;
    if (!inTopLeft && !inTopRight && !inBottomLeft) return null;

    const lr = inBottomLeft ? r - (qrSize - 7) : r;
    const lc = inTopRight ? c - (qrSize - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left 5 Columns: Scannable Judge QR Card */}
      <div className="lg:col-span-5 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col justify-between">
        <div>
          <div className="bg-[#1B4332] text-white px-5 py-3 border-b-[3px] border-[#1B1F24] flex items-center justify-between">
            <h2 className="font-mono text-xs font-black uppercase tracking-wider text-[#FFE66D]">
              Judge On-Stage QR Onboarding
            </h2>
            <QrCode className="w-4 h-4 text-[#FFE66D]" />
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-[#475569]">
              Scan or open the URL below to top up $5 in the PayPal Sandbox, enter a plain-English strategy, and deploy an autonomous agent onto the global billboard.
            </p>

            {/* High-Contrast QR Matrix Card */}
            <div className="bg-white border-2 border-[#1B1F24] text-[#141414] p-6 rounded-xs flex flex-col items-center justify-center gap-4">
              <svg
                viewBox={`0 0 ${qrSize} ${qrSize}`}
                className="w-44 h-44"
                shapeRendering="crispEdges"
              >
                {Array.from({ length: qrSize }).map((_, r) =>
                  Array.from({ length: qrSize }).map((__, c) => {
                    const finder = isFinderCell(r, c);
                    const filled =
                      finder !== null
                        ? finder
                        : ((r * 31 + c * 17 + r * c) % 7) < 3;
                    return filled ? (
                      <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#141414" />
                    ) : null;
                  })
                )}
              </svg>
              <div className="text-center">
                <div className="font-mono text-xs font-black break-all">{appOrigin}</div>
                <div className="text-[11px] font-mono text-[#475569] mt-0.5">
                  PayPal Sandbox Mode Enabled · Instant $5 Top-Up
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t-[3px] border-[#1B1F24] bg-[#F5F3EB]">
          <button
            type="button"
            onClick={onOpenDeployStudio}
            className="w-full py-2.5 px-4 bg-[#FF4733] hover:bg-[#ff321b] text-white border-2 border-[#1B1F24] shadow-[3px_3px_0px_#1B1F24] font-mono font-black uppercase text-xs rounded-xs transition-all cursor-pointer"
          >
            Open Agent Studio
          </button>
        </div>
      </div>

      {/* Right 7 Columns: Embeddable Billboard Widget Generator */}
      <div className="lg:col-span-7 bg-[#FFFDF7] border-[3px] border-[#1B1F24] shadow-[5px_5px_0px_#1B1F24] rounded-xs overflow-hidden flex flex-col justify-between">
        <div>
          <div className="bg-[#181B20] text-[#F4F5F8] px-5 py-3 border-b-[3px] border-[#1B1F24] flex items-center justify-between">
            <div>
              <h2 className="font-mono text-xs font-black uppercase tracking-wider text-[#FFE66D]">
                Embeddable Live Billboard Widget
              </h2>
              <p className="text-xs font-mono text-[#94A3B8] mt-0.5">
                Embed the live global billboard wall on any website with a single iframe tag
              </p>
            </div>
            <Code2 className="w-4 h-4 text-[#FFE66D]" />
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-[#181B20] border-2 border-[#1B1F24] rounded-xs p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[#94A3B8]">
                  HTML Embed Snippet
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-1 text-xs font-mono font-black uppercase bg-[#FFE66D] text-[#141414] border border-[#0E1014] rounded-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#1B4332]" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Embed Code</span>
                      </>
                    )}
                  </button>
                  <a
                    href="/?embed=1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 text-xs font-mono font-bold bg-[#262B33] hover:bg-[#323944] text-[#FFE66D] border border-[#0E1014] rounded-xs inline-flex items-center gap-1"
                  >
                    <span>Open ?embed=1</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <pre className="text-xs font-mono text-[#FFE66D] overflow-x-auto whitespace-pre-wrap break-all">
                {iframeSnippet}
              </pre>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-[#F5F3EB] border-2 border-[#1B1F24] rounded-xs p-3.5">
                <div className="text-[#475569] uppercase text-[10px] font-bold">Sync Protocol</div>
                <div className="font-black text-[#141414] mt-1">
                  Server-Sent Events (SSE)
                </div>
              </div>
              <div className="bg-[#F5F3EB] border-2 border-[#1B1F24] rounded-xs p-3.5">
                <div className="text-[#475569] uppercase text-[10px] font-bold">Ad Format</div>
                <div className="font-black text-[#141414] mt-1">
                  Full-Wall Startup Templates
                </div>
              </div>
              <div className="bg-[#F5F3EB] border-2 border-[#1B1F24] rounded-xs p-3.5">
                <div className="text-[#475569] uppercase text-[10px] font-bold">Moderation Safety</div>
                <div className="font-black text-[#1B4332] mt-1">
                  AI Pre-Review + Kill Switch
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t-[3px] border-[#1B1F24] bg-[#F5F3EB] flex items-center justify-between text-xs font-mono text-[#475569]">
          <span>
            Append <code className="font-bold text-[#141414]">?embed=1</code> to render the chromeless billboard wall.
          </span>
          <span className="font-bold text-[#141414]">100% Responsive</span>
        </div>
      </div>
    </div>
  );
};
