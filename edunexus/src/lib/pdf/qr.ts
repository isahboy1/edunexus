import QRCode from "qrcode";

// Generate a QR code as PNG buffer for embedding into PDF documents
export async function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: "png",
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
