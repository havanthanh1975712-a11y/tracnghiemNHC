/**
 * Bộ chuẩn hóa tiếng Việt và sửa lỗi vỡ dấu / vỡ từ (Decomposed accents / OCR / PDF artifacts)
 * Chú ý: TUYỆT ĐỐI KHÔNG làm biến đổi nội dung công thức LaTeX nằm trong $...$
 */

// Bảng ánh xạ nguyên âm + loại dấu sang ký tự tiếng Việt chuẩn (Unicode NFC)
const ACCENT_MAP: Record<string, { acute: string; grave: string; hook: string; tilde: string; dot: string }> = {
    'a': { acute: 'á', grave: 'à', hook: 'ả', tilde: 'ã', dot: 'ạ' },
    'A': { acute: 'Á', grave: 'À', hook: 'Ả', tilde: 'Ã', dot: 'Ạ' },
    'â': { acute: 'ấ', grave: 'ầ', hook: 'ẩ', tilde: 'ẫ', dot: 'ậ' },
    'Â': { acute: 'Ấ', grave: 'Ầ', hook: 'Ẩ', tilde: 'Ẫ', dot: 'Ậ' },
    'ă': { acute: 'ắ', grave: 'ằ', hook: 'ẳ', tilde: 'ẵ', dot: 'ặ' },
    'Ă': { acute: 'Ắ', grave: 'Ằ', hook: 'Ẳ', tilde: 'Ẵ', dot: 'Ặ' },
    'e': { acute: 'é', grave: 'è', hook: 'ẻ', tilde: 'ẽ', dot: 'ẹ' },
    'E': { acute: 'É', grave: 'È', hook: 'Ẻ', tilde: 'Ẽ', dot: 'Ẹ' },
    'ê': { acute: 'ế', grave: 'ề', hook: 'ể', tilde: 'ễ', dot: 'ệ' },
    'Ê': { acute: 'Ế', grave: 'Ề', hook: 'Ể', tilde: 'Ễ', dot: 'Ệ' },
    'i': { acute: 'í', grave: 'ì', hook: 'ỉ', tilde: 'ĩ', dot: 'ị' },
    'I': { acute: 'Í', grave: 'Ì', hook: 'Ỉ', tilde: 'Ĩ', dot: 'Ị' },
    'o': { acute: 'ó', grave: 'ò', hook: 'ỏ', tilde: 'õ', dot: 'ọ' },
    'O': { acute: 'Ó', grave: 'Ò', hook: 'Ỏ', tilde: 'Õ', dot: 'Ọ' },
    'ô': { acute: 'ố', grave: 'ồ', hook: 'ổ', tilde: 'ỗ', dot: 'ộ' },
    'Ô': { acute: 'Ố', grave: 'Ồ', hook: 'Ổ', tilde: 'Ỗ', dot: 'Ộ' },
    'ơ': { acute: 'ớ', grave: 'ờ', hook: 'ở', tilde: 'ỡ', dot: 'ợ' },
    'Ơ': { acute: 'Ớ', grave: 'Ờ', hook: 'Ở', tilde: 'Ỡ', dot: 'Ợ' },
    'u': { acute: 'ú', grave: 'ù', hook: 'ủ', tilde: 'ũ', dot: 'ụ' },
    'U': { acute: 'Ú', grave: 'Ù', hook: 'Ủ', tilde: 'Ũ', dot: 'Ụ' },
    'ư': { acute: 'ứ', grave: 'ừ', hook: 'ử', tilde: 'ữ', dot: 'ự' },
    'Ư': { acute: 'Ứ', grave: 'Ừ', hook: 'Ử', tilde: 'Ữ', dot: 'Ự' },
    'y': { acute: 'ý', grave: 'ỳ', hook: 'ỷ', tilde: 'ỹ', dot: 'ỵ' },
    'Y': { acute: 'Ý', grave: 'Ỳ', hook: 'Ỷ', tilde: 'Ỹ', dot: 'Ỵ' },
    'ươ': { acute: 'ướ', grave: 'ườ', hook: 'ưở', tilde: 'ưỡ', dot: 'ượ' },
    'ƯƠ': { acute: 'ƯỚ', grave: 'ƯỜ', hook: 'ƯỞ', tilde: 'ƯỠ', dot: 'ƯỢ' },
    'ưa': { acute: 'ứa', grave: 'ừa', hook: 'ửa', tilde: 'ữa', dot: 'ựa' },
    'Ưa': { acute: 'Ứa', grave: 'Ừa', hook: 'Ửa', tilde: 'Ữa', dot: 'Ựa' },
    'ua': { acute: 'úa', grave: 'ùa', hook: 'ủa', tilde: 'ũa', dot: 'ụa' },
    'Ua': { acute: 'Úa', grave: 'Ùa', hook: 'Ủa', tilde: 'Ũa', dot: 'Ụa' },
    'ie': { acute: 'iế', grave: 'iề', hook: 'iể', tilde: 'iễ', dot: 'iệ' },
    'iê': { acute: 'iế', grave: 'iề', hook: 'iể', tilde: 'iễ', dot: 'iệ' },
    'Iê': { acute: 'Iế', grave: 'Iề', hook: 'Iể', tilde: 'Iễ', dot: 'Iệ' },
    'IÊ': { acute: 'IẾ', grave: 'IỀ', hook: 'IỂ', tilde: 'IỄ', dot: 'IỆ' },
    'ye': { acute: 'yế', grave: 'yề', hook: 'yể', tilde: 'yễ', dot: 'yệ' },
    'yê': { acute: 'yế', grave: 'yề', hook: 'yể', tilde: 'yễ', dot: 'yệ' },
    'uô': { acute: 'uố', grave: 'uồ', hook: 'uổ', tilde: 'uỗ', dot: 'uộ' },
    'Uô': { acute: 'Uố', grave: 'Uồ', hook: 'Uổ', tilde: 'Uỗ', dot: 'Uộ' },
    'UÔ': { acute: 'UỐ', grave: 'UỒ', hook: 'UỔ', tilde: 'UỖ', dot: 'UỘ' },
};

function getAccentType(char: string): 'acute' | 'grave' | 'hook' | 'tilde' | 'dot' | null {
    // Sắc: ´ (\u00B4), ˊ (\u02CA), ' , ’, \u0301
    if (char === '´' || char === '\u00B4' || char === '\u02CA' || char === "'" || char === '’' || char === '\u0301') return 'acute';
    // Huyền: ` (\u0060), ˋ (\u02CB), ‘, \u0300
    if (char === '`' || char === '\u0060' || char === '\u02CB' || char === '‘' || char === '\u0300') return 'grave';
    // Hỏi: ̉ (\u0309), ˀ
    if (char === '\u0309' || char === '̉' || char === 'ˀ') return 'hook';
    // Ngã: ~, ˜ (\u02DC), ̃ (\u0303)
    if (char === '~' || char === '˜' || char === '\u02DC' || char === '\u0303' || char === '̃') return 'tilde';
    // Nặng: ̣ (\u0323)
    if (char === '\u0323' || char === '̣') return 'dot';
    return null;
}

/**
 * Khôi phục văn bản tiếng Việt thuần túy (không đụng vào khối LaTeX)
 */
export function repairVietnameseTextOnly(raw: string): string {
    if (!raw) return '';

    // 1. Chuẩn hóa Unicode sang dạng dựng sẵn (NFC)
    let text = raw.normalize('NFC');

    // 2. Xóa các dấu thanh rác chèn ngay sau ký tự tiếng Việt đã có dấu
    // Ví dụ: Đố´i -> Đối, chấ´t -> chất, cấ´u -> cấu, biế´n -> biến, đấ´t -> đất
    text = text.replace(/([áàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵÁÀẢÃẠẮẰẲẴẶẤẦẨẪẬÉÈẺẼẸẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌỐỒỔỖỘỚỜỞỠỢÚÙỦŨỤỨỪỬỮỰÝỲỶỸỴ])\s*([´`'\u00B4\u02CA\u02CB\u02DC\u0309\u0303\u0323~]+)/g, '$1');

    // 3. Sửa các từ phổ biến bị vỡ dấu do font TCVN3 / VNI / PDF
    text = text
        .replace(/PHÂ\s*[`´'\u00B4\u02CA\u02CB~]\s*N/g, 'PHẦN')
        .replace(/NHIÊ\s*[`´'\u00B4\u02CA\u02CB~]\s*U/g, 'NHIỀU')
        .replace(/TRẮ\s+C/g, 'TRẮC')
        .replace(/TRÁ\s+I/g, 'TRÁI')
        .replace(/ĐẤ\s+T/g, 'ĐẤT')
        .replace(/CẤ\s+U/g, 'CẤU')
        .replace(/BIẾ\s+N/g, 'BIẾN')
        .replace(/ĐỐ\s+I/g, 'ĐỐI')
        .replace(/TƯỢ\s+NG/g, 'TƯỢNG')
        .replace(/(p|P)hâ\s*[`´'\u00B4\u02CA\u02CB~]\s*n/g, (_m, p1) => (p1 === 'P' ? 'Phần' : 'phần'))
        .replace(/(n|N)hiê\s*[`´'\u00B4\u02CA\u02CB~]\s*u/g, (_m, p1) => (p1 === 'N' ? 'Nhiều' : 'nhiều'))
        .replace(/(n|N)ươ\s*[`´'\u00B4\u02CA\u02CB~]\s*c/g, (_m, p1) => (p1 === 'N' ? 'Nước' : 'nước'))
        .replace(/(đ|Đ)ươ\s*[`´'\u00B4\u02CA\u02CB~]\s*c/g, (_m, p1) => (p1 === 'Đ' ? 'Được' : 'được'))
        .replace(/(t|T)rươ\s*[`´'\u00B4\u02CA\u02CB~]\s*c/g, (_m, p1) => (p1 === 'T' ? 'Trước' : 'trước'))
        .replace(/(l|L)ươ\s*[`´'\u00B4\u02CA\u02CB~]\s*ng/g, (_m, p1) => (p1 === 'L' ? 'Lượng' : 'lượng'))
        .replace(/(th|Th)ươ\s*[`´'\u00B4\u02CA\u02CB~]\s*ng/g, (_m, p1) => (p1 === 'Th' ? 'Thường' : 'thường'))
        .replace(/(h|H)ươ\s*[`´'\u00B4\u02CA\u02CB~]\s*ng/g, (_m, p1) => (p1 === 'H' ? 'Hướng' : 'hướng'))
        .replace(/(ng|Ng)ươ\s*[`´'\u00B4\u02CA\u02CB~]\s*i/g, (_m, p1) => (p1 === 'Ng' ? 'Người' : 'người'))
        .replace(/(ch|Ch)iê\s*[`´'\u00B4\u02CA\u02CB~]\s*u/g, (_m, p1) => (p1 === 'Ch' ? 'Chiều' : 'chiều'))
        .replace(/(b|B)ă\s*[`´'\u00B4\u02CA\u02CB~]\s*ng/g, (_m, p1) => (p1 === 'B' ? 'Bằng' : 'bằng'))
        .replace(/(c|C)hâ\s*[`´'\u00B4\u02CA\u02CB~]\s*t/g, (_m, p1) => (p1 === 'C' ? 'Chất' : 'chất'))
        .replace(/(c|C)â\s*[`´'\u00B4\u02CA\u02CB~]\s*n/g, (_m, p1) => (p1 === 'C' ? 'Cần' : 'cần'))
        .replace(/(c|C)â\s*[`´'\u00B4\u02CA\u02CB~]\s*u/g, (_m, p1) => (p1 === 'C' ? 'Cấu' : 'cấu'))
        .replace(/(đ|Đ)â\s*[`´'\u00B4\u02CA\u02CB~]\s*u/g, (_m, p1) => (p1 === 'Đ' ? 'Đầu' : 'đầu'))
        .replace(/(đ|Đ)â\s*[`´'\u00B4\u02CA\u02CB~]\s*t/g, (_m, p1) => (p1 === 'Đ' ? 'Đất' : 'đất'))
        .replace(/(b|B)iê\s*[`´'\u00B4\u02CA\u02CB~]\s*n/g, (_m, p1) => (p1 === 'B' ? 'Biến' : 'biến'))
        .replace(/(đ|Đ)ô\s*[`´'\u00B4\u02CA\u02CB~]\s*i/g, (_m, p1) => (p1 === 'Đ' ? 'Đối' : 'đối'));

    // 4. Sửa dạng nguyên âm đôi + dấu rời rạc (iê, uô, ươ, ưa, ua, ie, ye, IÊ, UÔ, ƯƠ)
    const diphthongPattern = /(iê|uô|ươ|ưa|ua|ie|ye|Iê|Uô|Ươ|Ưa|Ua|IÊ|UÔ|ƯƠ)\s*([´`'\u00B4\u02CA\u02CB\u02DC\u0309\u0303\u0323~])\s*([a-zA-ZđĐ]*)/g;
    text = text.replace(diphthongPattern, (match, diph, accentChar, nextChars) => {
        const accentType = getAccentType(accentChar);
        const lowerDiph = diph.toLowerCase();
        if (accentType && ACCENT_MAP[lowerDiph]) {
            const isAllUpper = diph === diph.toUpperCase();
            const isFirstUpper = diph[0] === diph[0].toUpperCase();
            let fixed = ACCENT_MAP[lowerDiph][accentType];
            if (isAllUpper && fixed) {
                fixed = fixed.toUpperCase();
            } else if (isFirstUpper && fixed) {
                fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
            }
            if (fixed) {
                return fixed + (nextChars || '');
            }
        }
        return match;
    });

    // 5. Sửa dạng nguyên âm đơn + dấu rời rạc: [Nguyên âm] + [Dấu rời: ´ ` ' ~] + [Phụ âm / Nguyên âm tiếp theo]
    const singleVowelPattern = /([aAăĂâÂeEêÊiIoOôÔơƠuUưƯyY])\s*([´`'\u00B4\u02CA\u02CB\u02DC\u0309\u0303\u0323~])\s*([a-zA-ZđĐ]*)/g;
    text = text.replace(singleVowelPattern, (match, vowel, accentChar, nextChars) => {
        const accentType = getAccentType(accentChar);
        if (accentType && ACCENT_MAP[vowel]) {
            const fixedVowel = ACCENT_MAP[vowel][accentType];
            if (fixedVowel) {
                return fixedVowel + (nextChars || '');
            }
        }
        return match;
    });

    // 6. Sửa các từ tiếng Việt bị vỡ cụ thể (ghép đúng từ đơn/từ ghép, TUYỆT ĐỐI không gộp từ khác)
    // Sửa các cặp từ bị chèn khoảng trắng thường gặp trong đề thi:
    const specificBrokenWords: [RegExp, string][] = [
        [/\bbằ\s+ng\b/gi, 'bằng'],
        [/\bchiề\s+u\b/gi, 'chiều'],
        [/\bchuyể\s+n\b/gi, 'chuyển'],
        [/\bquã\s+ng\b/gi, 'quãng'],
        [/\bđườ\s+ng\b/gi, 'đường'],
        [/\bđộ\s+ng\b/gi, 'động'],
        [/\bthẳ\s+ng\b/gi, 'thẳng'],
        [/\bđổ\s+i\b/gi, 'đổi'],
        [/\btrò\s+n\b/gi, 'tròn'],
        [/\blỏ\s+ng\b/gi, 'lỏng'],
        [/\bchấ\s+t\b/gi, 'chất'],
        [/\bcầ\s+n\b/gi, 'cần'],
        [/\bđầ\s+u\b/gi, 'đầu'],
        [/\bnhiệ\s+t\b/gi, 'nhiệt'],
        [/\bvậ\s+t\b/gi, 'vật'],
        [/\bkhô\s+ng\b/gi, 'không'],
        [/\bbiế\s+t\b/gi, 'biết'],
        [/\bđiể\s+m\b/gi, 'điểm'],
        [/\bthờ\s+i\b/gi, 'thời'],
        [/\bgiâ\s+y\b/gi, 'giây']
    ];

    for (const [regex, replacement] of specificBrokenWords) {
        text = text.replace(regex, replacement);
    }

    return text.normalize('NFC');
}

/**
 * Chuẩn hóa toàn bộ chuỗi nhưng bảo vệ an toàn 100% cho các khối LaTeX $...$
 */
export function normalizeFullText(text: string): string {
    if (!text) return '';

    // Nếu không có ký tự $, chuẩn hóa trực tiếp text
    if (!text.includes('$')) {
        return repairVietnameseTextOnly(text);
    }

    // Tách chuỗi thành các phần LaTeX ($...$) và văn bản thường
    const parts = text.split(/(\$.*?\$)/g);
    
    return parts.map(part => {
        if (part.startsWith('$') && part.endsWith('$')) {
            // Khối LaTeX: Giữ NGUYÊN BẢN để KaTeX xử lý chính xác tuyệt đối
            return part;
        }
        // Khối văn bản thường: Sửa lỗi tiếng Việt bị vỡ dấu
        return repairVietnameseTextOnly(part);
    }).join('');
}

export function repairVietnameseText(raw: string): string {
    return normalizeFullText(raw);
}
