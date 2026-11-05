import path from "node:path";
import { platform } from "@electron-toolkit/utils";

/**
 * What two paths share when they'd be one file. Disks on macOS and Windows fold
 * case by default, more widely than either JavaScript mapping: lowering alone
 * keeps `ς` from `σ` and `ß` from `ss`, and raising alone keeps `ẞ` from `ß`.
 * Normalizing comes last because raising can leave a decomposed form. Joining
 * names a disk keeps apart, such as `I` and `ı` or any pair on a case-sensitive
 * disk, only adds a ` (1)`.
 */
export function pathKey(filePath: string) {
  return platform.isLinux ? filePath : filePath.toLowerCase().toUpperCase().normalize("NFC");
}

const PREFERRED_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
  ["image/bmp", "bmp"],
  ["image/tiff", "tiff"],
  ["image/heic", "heic"],
  ["image/avif", "avif"],
  ["image/x-icon", "ico"],
  ["image/vnd.microsoft.icon", "ico"],
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
  ["text/html", "html"],
  ["text/css", "css"],
  ["text/csv", "csv"],
  ["application/json", "json"],
  ["application/xml", "xml"],
  ["text/xml", "xml"],
  ["application/rtf", "rtf"],
  ["text/rtf", "rtf"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.ms-powerpoint", "ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.oasis.opendocument.text", "odt"],
  ["application/vnd.oasis.opendocument.spreadsheet", "ods"],
  ["application/vnd.oasis.opendocument.presentation", "odp"],
  ["text/calendar", "ics"],
  ["application/zip", "zip"],
  ["application/x-zip-compressed", "zip"],
  ["application/gzip", "gz"],
  ["application/x-gzip", "gz"],
  ["application/x-tar", "tar"],
  ["application/x-7z-compressed", "7z"],
  ["application/vnd.rar", "rar"],
  ["application/x-rar-compressed", "rar"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
  ["video/x-msvideo", "avi"],
  ["image/heif", "heif"],
  ["image/pjpeg", "jpg"],
  ["application/vnd.ms-word.document.macroenabled.12", "docm"],
  ["application/vnd.ms-word.template.macroenabled.12", "dotm"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.template", "dotx"],
  ["application/vnd.ms-excel.sheet.macroenabled.12", "xlsm"],
  ["application/vnd.ms-excel.template.macroenabled.12", "xltm"],
  ["application/vnd.ms-excel.sheet.binary.macroenabled.12", "xlsb"],
  ["application/vnd.ms-excel.addin.macroenabled.12", "xlam"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.template", "xltx"],
  ["application/vnd.ms-powerpoint.presentation.macroenabled.12", "pptm"],
  ["application/vnd.ms-powerpoint.slideshow.macroenabled.12", "ppsm"],
  ["application/vnd.ms-powerpoint.template.macroenabled.12", "potm"],
  ["application/vnd.ms-powerpoint.addin.macroenabled.12", "ppam"],
  ["application/vnd.openxmlformats-officedocument.presentationml.slideshow", "ppsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.template", "potx"],
  ["text/vcard", "vcf"],
  ["text/x-vcard", "vcf"],
  ["text/tab-separated-values", "tsv"],
  ["message/rfc822", "eml"],
  ["application/vnd.ms-outlook", "msg"],
  ["application/pkcs7-signature", "p7s"],
  ["application/vnd.apple.pkpass", "pkpass"],
  ["application/epub+zip", "epub"],
  ["application/x-apple-diskimage", "dmg"],
  ["application/vnd.android.package-archive", "apk"],
  ["application/oxps", "oxps"],
]);

/** Adds the extension a file of this type usually has, when the name has none and the type is known. */
export function withPreferredExtension(fileName: string, mimeType: string) {
  if (path.extname(fileName)) {
    return fileName;
  }

  const extension = PREFERRED_EXTENSIONS.get((mimeType.split(";")[0] ?? "").trim().toLowerCase());

  return extension ? `${fileName}.${extension}` : fileName;
}

function nextPath(filePath: string) {
  const extension = path.extname(filePath);

  const name = path.basename(filePath, extension);

  const [, base = name, number = "0"] = /^(.*)\((\d+)\)$/.exec(name) ?? [];

  return path.join(path.dirname(filePath), `${base.trim()} (${Number(number) + 1})${extension}`);
}

/** The path itself, or the first of `name (1).ext`, `name (2).ext` and so on that isn't taken. */
export function findUnusedPath(filePath: string, isTaken: (candidate: string) => boolean) {
  let candidate = filePath;

  while (isTaken(candidate)) {
    candidate = nextPath(candidate);
  }

  return candidate;
}
