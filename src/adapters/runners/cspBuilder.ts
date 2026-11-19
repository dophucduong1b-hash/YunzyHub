/**
 * Strict Content Security Policy (CSP) injected as the very first element in <head>
 * before any imported HTML content or scripts.
 *
 * Security invariants:
 * - default-src 'none': denies all network/external origins by default
 * - connect-src 'none': blocks fetch(), XMLHttpRequest, WebSocket, EventSource
 * - script-src 'unsafe-inline' blob: data:: allows only inline and packaged scripts
 * - style-src 'unsafe-inline' blob: data:: allows only inline and packaged styles
 * - img-src / font-src / media-src blob: data:: allows only packaged media
 * - frame-src 'none' / object-src 'none' / base-uri 'none' / form-action 'none'
 */
export const SANDBOX_CSP_DIRECTIVE = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob: data:",
  "style-src 'unsafe-inline' blob: data:",
  "img-src blob: data:",
  "font-src blob: data:",
  "media-src blob: data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const SANDBOX_IFRAME_PERMISSIONS = 'allow-scripts allow-downloads';

export const RUNNER_LIMITATIONS_VI: string[] = [
  'Cô lập nguồn gốc mờ (Opaque Origin): Công cụ chạy trong <iframe sandbox="allow-scripts allow-downloads"> không có allow-same-origin. Lớp tương thích của YunzyHub cung cấp localStorage cô lập riêng cho từng công cụ (đồng bộ an toàn qua IndexedDB) và sessionStorage theo phiên mà không lộ trạng thái của Hub.',
  'Chặn kết nối mạng mặc định (CSP connect-src \'none\'): Các lệnh gọi fetch(), XMLHttpRequest, WebSocket hoặc nạp CDN bên ngoài bị chặn. Riêng thư viện pdf-lib@1.17.1 từ CDN chuẩn (jsdelivr/unpkg/cdnjs) được tự động ánh xạ sang bản đóng gói cục bộ an toàn.',
  'Hỗ trợ tải tệp xuất ra (allow-downloads): Cho phép người dùng tải xuống tệp kết quả (như PDF, JSON, ảnh) từ Blob/Data URI mà không mở quyền điều hướng trang cha hoặc cửa sổ bật lên.',
  'Chặn điều hướng khung cha & cửa sổ bật lên: window.top.location, window.parent navigation và window.open() bị vô hiệu hóa hoàn toàn.',
];

