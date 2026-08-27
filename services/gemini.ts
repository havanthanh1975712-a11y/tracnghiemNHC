
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Grade, QuestionLevel, SubQuestion } from "../types";
import { v4 as uuidv4 } from 'uuid';
import { normalizeFullText, cleanLatexTextTags } from './vietnameseFixer';

export const cleanJsonString = (str: string): string => {
    return str.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
};

export const safeParseJsonWithLatex = (inputStr: string): any => {
    if (!inputStr || typeof inputStr !== 'string') return null;
    const cleanStr = cleanJsonString(inputStr);

    // Thử parse trực tiếp
    try {
        return JSON.parse(cleanStr);
    } catch (firstErr) {
        // Nếu thất bại do các ký tự escape LaTeX (như \Delta, \frac, \text, \pm, \alpha, \s, \d...), sửa chữa tự động
        try {
            // Thay thế các ký tự escape không hợp lệ trong chuỗi JSON thành escape kép (\\)
            // JSON chỉ cho phép escape: \" \\ \/ \b \f \n \r \t \uXXXX
            const fixedEscape = cleanStr.replace(/\\([^"\\\/bfnrtu]|u(?![\da-fA-F]{4}))/g, '\\\\$1');
            return JSON.parse(fixedEscape);
        } catch (secondErr) {
            // Thử dọn dẹp các ký tự điều khiển tab/newline ẩn
            try {
                const noInvalidCtrl = cleanStr
                    .replace(/\r\n/g, "\\n")
                    .replace(/\n/g, "\\n")
                    .replace(/\t/g, "\\t");
                return JSON.parse(noInvalidCtrl);
            } catch (thirdErr: any) {
                throw new Error("Cấu trúc file hoặc chuỗi JSON không hợp lệ: " + (firstErr as Error).message);
            }
        }
    }
};

const normalizeLevel = (val: any): QuestionLevel | undefined => {
    if (!val) return undefined;
    const str = String(val).trim().toUpperCase();
    if (str === 'B' || str === 'NB' || str.includes('NHẬN BIẾT') || str.includes('BIẾT') || str === 'EASY' || str.includes('KNOW')) return 'B';
    if (str === 'H' || str === 'TH' || str.includes('THÔNG HIỂU') || str.includes('HIỂU') || str === 'MEDIUM' || str.includes('UNDERSTAND')) return 'H';
    if (str === 'VD' || str.includes('VẬN DỤNG CAO') || str === 'VDC' || str === 'VERY HARD' || str === 'VHARD' || str.includes('ANALY') || str.includes('APPLY') || str === 'HARD') {
        if (str === 'VDC' || str.includes('CAO') || str === 'VERY HARD' || str === 'VHARD' || str.includes('ANALY')) return 'VDC';
        return 'VD';
    }
    return undefined;
};

const extractLevelFromText = (text: string): { cleanText: string; level?: QuestionLevel } => {
    if (!text) return { cleanText: "" };
    let cleanText = cleanLatexTextTags(text);
    let level: QuestionLevel | undefined = undefined;

    // Pattern: [B], (B), <B>, [NB], [H], [TH], [VD], [VDC] at start or inside
    const levelRegex = /(?:\[|\(|\<)\s*(B|NB|H|TH|VD|VDC|Nhận biết|Thông hiểu|Vận dụng cao|Vận dụng|Biết|Hiểu)\s*(?:\]|\)|\>)/i;
    const match = cleanText.match(levelRegex);
    if (match) {
        level = normalizeLevel(match[1]);
        cleanText = cleanText.replace(match[0], "").trim();
    }
    return { cleanText, level };
};

const stripOptionLabel = (text: string): string => {
    if (!text) return "";
    // Chuẩn hóa dấu tiếng Việt và làm sạch thẻ \text / ext
    let cleaned = normalizeFullText(text.trim());
    // Xử lý đệ quy để xóa nhiều lớp nhãn (VD: "A. A. Nội dung")
    const labelRegex = /^(\*?[A-Za-z0-9][\.\)\/\-:\s]\s*)/g;
    
    while (labelRegex.test(cleaned)) {
        cleaned = cleaned.replace(labelRegex, "").trim();
    }
    return cleanLatexTextTags(cleaned);
};

const EXTRACTION_INSTRUCTION = `Bạn là chuyên gia khảo thí và giáo viên sư phạm hàng đầu THPT quốc gia Việt Nam (Toán, Vật lí, Hóa học, Sinh học, Tin học, Ngữ văn, Lịch sử, Địa lí, GDCD, Tiếng Anh).

NHIỆM VỤ:
1. Trích xuất đầy đủ, trung thực và chính xác toàn bộ câu hỏi, phương án, mức độ nhận biết từ tài liệu được cung cấp (file PDF hoặc đoạn văn bản).
2. TẠO LỜI GIẢI GỌN GÀNG, SÚC TÍCH 100% CHO TẤT CẢ CÁC CÂU HỎI (BẮT BUỘC): Điền đầy đủ vào trường 'solution'. TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỂ TRỐNG TRƯỜNG 'solution' Ở BẤT KỲ CÂU HỎI NÀO.

QUY TẮC VIẾT LỜI GIẢI ('solution') - NGẮN GỌN, VIẾT CÔNG THỨC RỒI BẰNG KẾT QUẢ, THEO GẠCH ĐẦU DÒNG (CỰC KỲ QUAN TRỌNG):
- PHONG CÁCH: Trình bày đơn giản, súc tích bằng các gạch đầu dòng (- ...).
- CÔNG THỨC & KẾT QUẢ: Viết công thức/định luật rồi ghi dấu bằng ra kết quả luôn (Dạng: [Công thức] = [Kết quả]). 
  TUYỆT ĐỐI BỎ QUA quá trình điền/thay thế số chi tiết, vụn vặt vào giữa các phép tính để tránh làm rối lời giải.
- KHÔNG viết văn rườm rà, giải thích lòng vòng lan man.

1. MCQ (Trắc nghiệm 4 lựa chọn):
   - 'correctAnswer': BẮT BUỘC là nội dung chính xác của phương án đúng (không kèm nhãn A, B, C, D).
   - 'solution': Trình bày bằng gạch đầu dòng:
     - Áp dụng công thức: [Công thức] = [Kết quả].
     - Chọn đáp án: [Nội dung phương án đúng].

2. GROUP-TF (Trắc nghiệm Đúng/Sai):
   - 'subQuestions': BẮT BUỘC có đủ 4 ý (a, b, c, d). Mỗi ý gồm 'text', 'correctAnswer' ("True" hoặc "False") và 'level' ("B"|"H"|"VD"|"VDC").
   - 'solution': BẮT BUỘC trình bày theo 4 ý a, b, c, d dạng gạch đầu dòng ngắn gọn:
     - a) Đúng. Vì [Công thức] = [Kết quả].
     - b) Sai. Vì [Công thức] = [Kết quả đúng].
     - c) Đúng. Vì [Lý do / Công thức ngắn gọn].
     - d) Sai. Vì [Lý do / Công thức ngắn gọn].

3. SHORT (Trả lời ngắn):
   - 'type': BẮT BUỘC là "short".
   - 'correctAnswer': BẮT BUỘC là giá trị con số chính xác (VD: "12", "-3.5", "0.25").
   - 'solution': Dùng các gạch đầu dòng ngắn gọn:
     - [Công thức/Định luật] = [Kết quả].
     - Đáp số: [Số].

4. PHÂN TÍCH ĐÁP ÁN:
   - Quét toàn bộ nội dung để tìm bảng đáp án (thường ở cuối trang hoặc đính kèm).
   - Nếu tài liệu không có bảng đáp án, AI tự tính để xác định 'correctAnswer'.

5. NHẬN DIỆN MỨC ĐỘ (level: "B" | "H" | "VD" | "VDC"):
   - Tự động nhận diện: [B], [NB] -> "B" (Nhận biết); [H], [TH] -> "H" (Thông hiểu); [VD] -> "VD" (Vận dụng); [VDC] -> "VDC" (Vận dụng cao).

6. QUY TẮC CÔNG THỨC & ĐƠN VỊ:
   - Mọi công thức toán học phải bọc trong cặp dấu $...$ (VD: $x^2 + y^2 = R^2$, $\\Delta t = 2$ s).
   - TUYỆT ĐỐI KHÔNG dùng thẻ \\text{...}, \\mathrm{...}, \\mbox{...} (để tránh lỗi JSON escape \\t thành 'ext').
   - Đơn vị đo (m/s, km/h, kg, g, N, J, W, V, A, Hz, s, min, h, cm, rad/s...): Viết dạng văn bản thường ngoài dấu $ (VD: '$v = 20$ m/s', '$m = 5$ kg') hoặc viết trực tiếp (VD: '$20$ m/s').
   - Chỉ số trên/dưới (VD: $v_{max}$, $F_{ms}$, $m_1$, $x_2$): Viết thẳng chữ vào chỉ số không bọc \\text{}.

7. LÀM SẠCH NHÃN:
   - Xóa nhãn "A.", "B.", "a)", "b)", "[B]", "(H)"... ở đầu nội dung câu hỏi và các phương án nhưng giữ nguyên dấu $ của LaTeX.

VÍ DỤ CẤU TRÚC JSON:
- MCQ: {"type": "mcq", "level": "B", "text": "Một vật dao động điều hòa...", "options": ["$10$ cm/s", "$20$ cm/s", "$30$ cm/s", "$40$ cm/s"], "correctAnswer": "$20$ cm/s", "solution": "- Áp dụng công thức: $v_{max} = \\omega A = 20$ cm/s.\\n- Chọn đáp án: $20$ cm/s."}
- GROUP-TF: {"type": "group-tf", "level": "H", "text": "Cho một vật dao động điều hòa có phương trình $x = 5\\cos(2\\pi t)$ cm...", "subQuestions": [{"text": "Biên độ dao động của vật là $5$ cm.", "correctAnswer": "True", "level": "B"}, {"text": "Tần số góc của dao động là $4\\pi$ rad/s.", "correctAnswer": "False", "level": "B"}, {"text": "Vận tốc cực đại của vật là $10\\pi$ cm/s.", "correctAnswer": "True", "level": "H"}, {"text": "Gia tốc cực đại của vật là $100\\pi^2$ cm/s$^2$.", "correctAnswer": "False", "level": "VD"}], "solution": "- a) Đúng. Biên độ $A = 5$ cm.\\n- b) Sai. Tần số góc $\\omega = 2\\pi$ rad/s.\\n- c) Đúng. Vận tốc cực đại $v_{max} = \\omega A = 10\\pi$ cm/s.\\n- d) Sai. Gia tốc cực đại $a_{max} = \\omega^2 A = 20\\pi^2$ cm/s$^2$."}
- SHORT: {"type": "short", "level": "VD", "text": "Một mạch dao động LC lí tưởng gồm cuộn cảm thuần $L = 2$ mH và tụ điện $C = 8$ pF. Chu kỳ dao động riêng của mạch là bao nhiêu microgiây (làm tròn đến 2 chữ số thập phân)?", "correctAnswer": "0.79", "solution": "- Chu kỳ dao động: $T = 2\\pi\\sqrt{LC} = 2,51 \\cdot 10^{-6}$ s = $2,51$ $\\mu$s.\\n- Đáp số: $0.79$."}
`;

const processAIQuestions = (rawData: any[]): Question[] => {
    return rawData.map((item: any) => {
        const type = item.type?.toLowerCase() || 'mcq';
        const strippedOptions = item.options ? item.options.map((opt: string) => stripOptionLabel(opt)) : (type === 'mcq' ? [] : undefined);
        let finalCorrectAnswer = item.correctAnswer ? cleanLatexTextTags(String(item.correctAnswer)) : item.correctAnswer;

        // Xử lý trích xuất level từ text câu hỏi nếu chưa có
        let extractedMain = extractLevelFromText(item.text || "");
        let finalLevel = normalizeLevel(item.level) || extractedMain.level;
        let cleanedText = normalizeFullText(extractedMain.cleanText);
        let cleanedSolution = normalizeFullText(item.solution || "");

        if (type === 'mcq' && item.correctAnswer && item.options) {
            let ansText = item.correctAnswer.trim();
            const matchLabel = ansText.match(/(?:Đáp án|Chọn|Câu\s*\d+[:\s]*|^)\s*([A-D])(?:\.|\s|$)/i);
            
            if (matchLabel) {
                const label = matchLabel[1].toUpperCase();
                const index = label.charCodeAt(0) - 65;
                if (item.options[index]) {
                    finalCorrectAnswer = stripOptionLabel(item.options[index]);
                }
            } else {
                finalCorrectAnswer = stripOptionLabel(ansText);
            }
        }

        // Đảm bảo correctAnswer của MCQ luôn khớp với một trong các options sau khi đã strip
        if (type === 'mcq' && strippedOptions && finalCorrectAnswer) {
            const cleanAns = stripOptionLabel(finalCorrectAnswer);
            const exactMatch = strippedOptions.find((opt: string) => stripOptionLabel(opt) === cleanAns);
            if (exactMatch) {
                finalCorrectAnswer = exactMatch;
            } else {
                const fuzzyMatch = strippedOptions.find((opt: string) => {
                    const cleanOpt = stripOptionLabel(opt);
                    return cleanOpt.includes(cleanAns) || cleanAns.includes(cleanOpt);
                });
                if (fuzzyMatch) finalCorrectAnswer = fuzzyMatch;
            }
        }

        if (type === 'short') {
            finalCorrectAnswer = item.correctAnswer?.toString().trim() || "";
        }

        return {
            ...item,
            type,
            id: uuidv4(),
            text: cleanedText,
            solution: cleanedSolution,
            level: finalLevel,
            points: item.points || (type === 'mcq' ? 0.25 : type === 'group-tf' ? 1.0 : 0.5),
            options: strippedOptions,
            correctAnswer: finalCorrectAnswer,
            subQuestions: item.subQuestions ? item.subQuestions.map((sq: any) => {
                const sqExtract = extractLevelFromText(sq.text || "");
                return { 
                    ...sq, 
                    id: uuidv4(),
                    text: stripOptionLabel(sqExtract.cleanText),
                    level: normalizeLevel(sq.level) || sqExtract.level,
                    correctAnswer: (sq.correctAnswer === 'True' || sq.correctAnswer === 'Đúng' || sq.correctAnswer === 'Đ' || sq.correctAnswer === 'T' || sq.correctAnswer === 'true' || sq.correctAnswer === '1') ? 'True' : 'False'
                };
            }) : undefined
        };
    });
};

const formatGeminiError = (error: any): string => {
    const errorStr = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
    if (errorStr.includes('403') || errorStr.includes('PERMISSION_DENIED') || errorStr.includes('permission')) {
        return "Lỗi 403 (Không có quyền truy cập): API Key chưa được cấp quyền gọi Gemini API.\n• Khắc phục: Bạn vui lòng vào https://aistudio.google.com/app/apikey tạo một API Key mới (miễn phí), hoặc nếu tạo trong Google Cloud Console thì cần bật (Enable) API 'Generative Language API' và kiểm tra API Key restrictions.";
    }
    if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('quota')) {
        return "Lỗi 429 (Vượt quá hạn mức): API Key này đã hết lượt gọi tạm thời hoặc bị giới hạn tốc độ. Vui lòng đợi khoảng 1 phút rồi thử lại, hoặc nhập một API Key khác.";
    }
    if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('API key not valid') || errorStr.includes('400')) {
        return "Lỗi 400: API Key không hợp lệ hoặc dữ liệu gửi đi không đúng định dạng. Vui lòng kiểm tra lại mã API Key.";
    }
    return errorStr;
};

const getAiClient = (overrideApiKey?: string): GoogleGenAI => {
    const key = (overrideApiKey && overrideApiKey.trim()) ? overrideApiKey.trim() : (process.env.API_KEY || "");
    if (!key) {
        throw new Error("Chưa có Gemini API Key! Vui lòng nhập API Key của bạn vào ô bên cạnh nút tạo đề/soạn đề hoặc cấu hình trên hệ thống.");
    }
    return new GoogleGenAI({ apiKey: key });
};

export const generateQuizFromPrompt = async (config: any, customApiKey?: string): Promise<Question[]> => {
    const keyToUse = customApiKey || config.apiKey;
    const ai = getAiClient(keyToUse);
    
    let matrixPrompt = "";
    if (config.matrix) {
        matrixPrompt = `
MA TRẬN ĐỘ KHÓ (PHÂN BỔ THEO % TỔNG SỐ CÂU):
- Nhận biết (Easy/Knowledge): ${config.matrix.easy}% 
- Thông hiểu (Medium/Understanding): ${config.matrix.medium}%
- Vận dụng (Hard/Application): ${config.matrix.hard}%
- Vận dụng cao (Very Hard/High Application): ${config.matrix.vhard}%
Hãy phân bổ độ khó cho các câu hỏi sao cho tỉ lệ các mức độ sát với ma trận này nhất có thể.
`;
    }

    const sourceInstruction = config.pdfBase64 
        ? "NGUỒN DỮ LIỆU: Hãy đọc kỹ file PDF được cung cấp. BẮT BUỘC chỉ được lấy dữ liệu, ý tưởng hoặc trích xuất trực tiếp các câu hỏi từ nội dung trong file PDF này để soạn đề. Không được tự ý chế tác nội dung nằm ngoài phạm vi tài liệu PDF trừ khi cần thiết để hoàn thiện cấu trúc câu hỏi."
        : "NGUỒN DỮ LIỆU: Sử dụng kho tri thức chuyên sâu của bạn về chương trình giáo dục phổ thông Việt Nam để soạn đề.";

    const prompt = `Bạn là chuyên gia soạn đề thi THPT quốc gia Việt Nam môn Toán/Lý/Hóa.
${sourceInstruction}

YÊU CẦU CHI TIẾT:
- Chủ đề: ${config.topic}.
- Khối lớp: ${config.grade}.
- Cấu trúc: ${config.part1Count} câu trắc nghiệm 4 lựa chọn (MCQ), ${config.part2Count} câu trắc nghiệm Đúng/Sai (Group-TF), ${config.part3Count} câu trả lời ngắn (Short).
${matrixPrompt}

QUY TẮC KỸ THUẬT BẮT BUỘC:
1. LaTeX & ĐƠN VỊ:
   - Mọi biểu thức, công thức, ký hiệu toán/lý/hóa (VD: $\\Delta\\Phi$, $\\Omega$, $x^2$, $\\vec{v}$) BẮT BUỘC phải nằm trong cặp dấu $...$. Quy tắc này áp dụng cho NỘI DUNG CÂU HỎI, CÁC PHƯƠNG ÁN (Options), và LỜI GIẢI (Solution).
   - TUYỆT ĐỐI KHÔNG dùng thẻ \\text{...}, \\mathrm{...}, \\mbox{...} trong công thức (tránh lỗi JSON escape \\t thành 'ext').
   - Đơn vị đo (m/s, km/h, kg, g, N, J, W, V, A, Hz, s, min, h, cm, rad/s...): Hãy viết dạng văn bản thường ngoài dấu $ (VD: '$v = 20$ m/s', '$m = 5$ kg', '$F = 10$ N') hoặc viết trực tiếp (VD: '$20$ m/s').
   - Chỉ số trên/dưới (VD: $v_{max}$, $F_{ms}$, $m_1$, $x_2$, $I_{hd}$): Đánh trực tiếp chữ vào chỉ số không bọc \\text{}.
2. Solution (Lời giải): Lời giải đơn giản, súc tích bằng các gạch đầu dòng. Viết công thức rồi ghi dấu bằng ra kết quả ngay ([Công thức] = [Kết quả]), TUYỆT ĐỐI BỎ QUA quá trình thay số/điền số chi tiết vào giữa các phép tính để tránh rối mắt.
3. MCQ: 'correctAnswer' phải là nội dung của phương án đúng (không kèm nhãn A, B, C, D). 'solution' gồm: - Áp dụng công thức: [Công thức] = [Kết quả]. - Chọn đáp án: [Phương án đúng].
4. GROUP-TF: 
   - 'subQuestions' phải có chính xác 4 ý (a, b, c, d).
   - 'solution' trình bày 4 gạch đầu dòng ngắn gọn:
     - a) [Đúng/Sai]. Vì [Công thức] = [Kết quả]
     - b) [Đúng/Sai]. Vì [Công thức] = [Kết quả]
     ... (tương tự cho c, d)
5. Options: Tuyệt đối KHÔNG bao gồm nhãn "A.", "B.", "C.", "D." vào nội dung phương án.
6. JSON: Trả về kết quả dưới dạng mảng JSON chuẩn xác theo schema đã định.`;

    try {
        const contents = config.pdfBase64 
            ? {
                parts: [
                    { inlineData: { mimeType: "application/pdf", data: config.pdfBase64 } },
                    { text: prompt }
                ]
            }
            : prompt;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING },
                            text: { type: Type.STRING },
                            level: { type: Type.STRING, nullable: true },
                            points: { type: Type.NUMBER },
                            options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                            correctAnswer: { type: Type.STRING, nullable: true },
                            solution: { type: Type.STRING },
                            subQuestions: {
                                type: Type.ARRAY,
                                nullable: true,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        text: { type: Type.STRING },
                                        correctAnswer: { type: Type.STRING },
                                        level: { type: Type.STRING, nullable: true }
                                    },
                                    required: ["text", "correctAnswer"]
                                }
                            }
                        },
                        required: ["type", "text", "points", "solution"]
                    }
                }
            }
        });

        const textOutput = response.text || "[]";
        const rawData = JSON.parse(cleanJsonString(textOutput));
        
        return processAIQuestions(rawData);
    } catch (error: any) {
        throw new Error("AI không thể tạo đề: " + formatGeminiError(error));
    }
};

export const parseQuestionsFromPDF = async (base64Data: string, customApiKey?: string): Promise<Question[]> => {
  const ai = getAiClient(customApiKey);
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
          parts: [
              { inlineData: { mimeType: "application/pdf", data: base64Data } },
              { text: EXTRACTION_INSTRUCTION }
          ]
      },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING },
                    text: { type: Type.STRING },
                    level: { type: Type.STRING, nullable: true },
                    points: { type: Type.NUMBER },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                    correctAnswer: { type: Type.STRING, nullable: true },
                    solution: { type: Type.STRING },
                    subQuestions: {
                        type: Type.ARRAY,
                        nullable: true,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING },
                                correctAnswer: { type: Type.STRING },
                                level: { type: Type.STRING, nullable: true }
                            },
                            required: ["text", "correctAnswer"]
                        }
                    }
                },
                required: ["type", "text", "solution"]
            }
        }
      }
    });

    const textOutput = response.text || "[]";
    const rawData = safeParseJsonWithLatex(textOutput);
    
    return processAIQuestions(rawData);
  } catch (error: any) {
    throw new Error("Lỗi đọc PDF: " + formatGeminiError(error));
  }
};

export const parseQuestionsFromJSON = (input: string | any): { questions: Question[]; quizTitle?: string; grade?: Grade; category?: string; durationMinutes?: number } => {
    let parsed: any;
    if (typeof input === 'string') {
        try {
            parsed = safeParseJsonWithLatex(input);
        } catch (e: any) {
            throw new Error("Cấu trúc file hoặc chuỗi JSON không hợp lệ. Vui lòng kiểm tra lại cú pháp JSON!");
        }
    } else {
        parsed = input;
    }

    let rawQuestions: any[] = [];
    let quizTitle: string | undefined;
    let grade: Grade | undefined;
    let category: string | undefined;
    let durationMinutes: number | undefined;

    if (Array.isArray(parsed)) {
        rawQuestions = parsed;
    } else if (parsed && typeof parsed === 'object') {
        const infoObj = parsed.exam_info || parsed.info || parsed.metadata || parsed;
        
        if (infoObj.title || infoObj.quizTitle || infoObj.name || parsed.title || parsed.quizTitle || parsed.name) {
            quizTitle = infoObj.title || infoObj.quizTitle || infoObj.name || parsed.title || parsed.quizTitle || parsed.name;
        }
        if (infoObj.grade || parsed.grade) grade = String(infoObj.grade || parsed.grade) as Grade;
        if (infoObj.category || infoObj.subject || parsed.category || parsed.subject) category = infoObj.category || infoObj.subject || parsed.category || parsed.subject;
        
        const rawDur = infoObj.durationMinutes || infoObj.duration || infoObj.timeLimit || parsed.durationMinutes || parsed.duration || parsed.timeLimit;
        if (rawDur) {
            if (typeof rawDur === 'number') {
                durationMinutes = rawDur;
            } else if (typeof rawDur === 'string') {
                const match = rawDur.match(/\d+/);
                if (match) durationMinutes = parseInt(match[0], 10);
            }
        }

        // Extract questions from parts array or root questions arrays
        if (Array.isArray(parsed.parts)) {
            parsed.parts.forEach((part: any) => {
                if (Array.isArray(part.questions)) {
                    rawQuestions.push(...part.questions);
                } else if (Array.isArray(part.data)) {
                    rawQuestions.push(...part.data);
                } else if (Array.isArray(part.items)) {
                    rawQuestions.push(...part.items);
                }
            });
        }
        
        if (rawQuestions.length === 0) {
            if (Array.isArray(parsed.questions)) {
                rawQuestions = parsed.questions;
            } else if (Array.isArray(parsed.data)) {
                rawQuestions = parsed.data;
            } else if (Array.isArray(parsed.items)) {
                rawQuestions = parsed.items;
            } else if (parsed.quiz && Array.isArray(parsed.quiz.questions)) {
                rawQuestions = parsed.quiz.questions;
            } else {
                const possibleArray = Object.values(parsed).find(val => Array.isArray(val));
                if (possibleArray) {
                    rawQuestions = possibleArray as any[];
                }
            }
        }
    }

    if (!rawQuestions || rawQuestions.length === 0) {
        throw new Error("Không tìm thấy danh sách câu hỏi hợp lệ trong dữ liệu JSON!");
    }

    const normalizedRaw = rawQuestions.map((q: any) => {
        let typeStr = (q.type || q.qtype || q.questionType || q.question_type || '').toLowerCase().trim();
        let type = 'mcq';
        if (typeStr === 'mc' || typeStr === 'part1' || typeStr.includes('mcq') || typeStr.includes('trac_nghiem') || typeStr.includes('multiple')) {
            type = 'mcq';
        } else if (typeStr === 'tf' || typeStr === 'part2' || typeStr.includes('group') || typeStr.includes('dung_sai') || typeStr.includes('true_false')) {
            type = 'group-tf';
        } else if (typeStr === 'sa' || typeStr === 'part3' || typeStr.includes('short') || typeStr.includes('ngan') || typeStr.includes('tra_loi')) {
            type = 'short';
        } else {
            if (q.subQuestions || q.sub_questions || q.statements || q.y_con) {
                type = 'group-tf';
            } else if (q.options || q.choices || q.phuong_an) {
                type = 'mcq';
            } else {
                type = 'short';
            }
        }

        // Raw options: can be Array or Object (e.g. { "A": "...", "B": "..." })
        const rawOptions = q.options || q.choices || q.phuong_an || q.dap_an_lua_chon || q.answers;
        let optionsObj: Record<string, any> | null = null;
        let rawOptionsArray: any[] | null = null;

        if (Array.isArray(rawOptions)) {
            rawOptionsArray = rawOptions;
        } else if (rawOptions && typeof rawOptions === 'object') {
            optionsObj = rawOptions;
            rawOptionsArray = Object.values(rawOptions);
        }

        let subQuestions = q.subQuestions || q.sub_questions || q.statements || q.y_con;
        
        // Trường hợp câu hỏi Đúng/Sai (TF) mà danh sách mệnh đề nằm trong q.options
        if (type === 'group-tf' && !subQuestions && rawOptionsArray && Array.isArray(rawOptionsArray)) {
            subQuestions = rawOptionsArray;
        }

        if (Array.isArray(subQuestions)) {
            subQuestions = subQuestions.map((sq: any) => {
                let ans = sq.correctAnswer ?? sq.answer ?? sq.dap_an ?? sq.isTrue ?? sq.isCorrect ?? sq.correct ?? sq.correct_answer;
                if (ans === true || ans === 'True' || ans === 'true' || ans === 'Đ' || ans === 'Đúng' || ans === '1') {
                    ans = 'True';
                } else {
                    ans = 'False';
                }
                const sqText = sq.text || sq.content || sq.noi_dung || sq.question || '';
                const sqLevel = normalizeLevel(sq.level || sq.muc_do || sq.do_kho);
                return {
                    text: sqText.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$'),
                    correctAnswer: ans,
                    level: sqLevel
                };
            });
        }

        let rawCorrectVal = q.correct_answer ?? q.correctAnswer ?? q.answer ?? q.correct ?? q.dap_an_dung ?? q.dap_an ?? q.correctOptionIndex ?? q.correct_option_index ?? q.correctIndex ?? q.correct_index ?? q.answerIndex;

        let options: string[] | undefined = undefined;
        let correctAnswer = '';

        if (type === 'mcq' && rawOptionsArray) {
            options = rawOptionsArray.map((opt: any) => {
                const str = typeof opt === 'string' ? opt : (opt.text || opt.content || opt.label || String(opt));
                return str.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$');
            });

            // 1. Tìm trong thuộc tính isCorrect của option object
            const correctObj = rawOptionsArray.find((opt: any) => typeof opt === 'object' && (opt.isCorrect === true || opt.is_correct === true || opt.correct === true));
            if (correctObj) {
                const str = typeof correctObj === 'string' ? correctObj : (correctObj.text || correctObj.content || correctObj.label || String(correctObj));
                correctAnswer = str.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$');
            } else if (rawCorrectVal !== undefined && rawCorrectVal !== null && rawCorrectVal !== '') {
                // 2. Nếu optionsObj dạng { "A": "...", "B": "..." } và rawCorrectVal = "A" hay "D"
                if (optionsObj && typeof rawCorrectVal === 'string' && optionsObj[rawCorrectVal.trim()] !== undefined) {
                    const matchedVal = optionsObj[rawCorrectVal.trim()];
                    const str = typeof matchedVal === 'string' ? matchedVal : (matchedVal.text || matchedVal.content || String(matchedVal));
                    correctAnswer = str.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$');
                } else if (typeof rawCorrectVal === 'number') {
                    if (rawCorrectVal >= 0 && rawCorrectVal < options.length) {
                        correctAnswer = options[rawCorrectVal];
                    } else {
                        correctAnswer = String(rawCorrectVal);
                    }
                } else if (typeof rawCorrectVal === 'string') {
                    const trimmed = rawCorrectVal.trim();
                    if (/^\d+$/.test(trimmed)) {
                        const idx = parseInt(trimmed, 10);
                        if (idx >= 0 && idx < options.length) {
                            correctAnswer = options[idx];
                        } else {
                            correctAnswer = trimmed;
                        }
                    } else if (/^[A-Da-d][\.\:\s]*$/.test(trimmed)) {
                        const letter = trimmed.charAt(0).toUpperCase();
                        const idx = letter.charCodeAt(0) - 65;
                        if (idx >= 0 && idx < options.length) {
                            correctAnswer = options[idx];
                        } else {
                            correctAnswer = trimmed;
                        }
                    } else {
                        correctAnswer = trimmed;
                    }
                }
            }
        } else {
            if (rawCorrectVal !== undefined && rawCorrectVal !== null) {
                correctAnswer = String(rawCorrectVal).trim();
            }
        }

        // Question text: hợp nhất context (ngữ cảnh/đoạn văn) + câu hỏi
        let rawText = '';
        const contextStr = q.context || q.doan_van || q.bai_doc || '';
        const mainTextStr = q.text || q.question || q.content || q.cau_hoi || q.title || '';

        if (contextStr && mainTextStr) {
            rawText = `${contextStr}\n${mainTextStr}`;
        } else {
            rawText = mainTextStr || contextStr || '';
        }

        const rawSolution = q.solution || q.explanation || q.loi_giai || q.huong_dan_giai || q.guide || '';

        return {
            ...q,
            type,
            text: rawText.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$'),
            options: type === 'mcq' ? options : undefined,
            correctAnswer: typeof correctAnswer === 'string' ? correctAnswer.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$') : String(correctAnswer),
            solution: rawSolution.replace(/\\\(|\\\)/g, '$').replace(/\\\[|\\\]/g, '$$'),
            points: q.points || q.score || q.diem || (type === 'mcq' ? 0.25 : 1.0),
            subQuestions: type === 'group-tf' ? subQuestions : undefined
        };
    });

    const questions = processAIQuestions(normalizedRaw);

    return {
        questions,
        quizTitle,
        grade,
        category,
        durationMinutes
    };
};

export const parseQuestionsFromText = async (rawText: string, customApiKey?: string): Promise<Question[]> => {
    const ai = getAiClient(customApiKey);
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `${EXTRACTION_INSTRUCTION}\n\nNỘI DUNG VĂN BẢN CẦN TRÍCH XUẤT:\n${rawText}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING },
                            text: { type: Type.STRING },
                            points: { type: Type.NUMBER },
                            options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                            correctAnswer: { type: Type.STRING, nullable: true },
                            solution: { type: Type.STRING },
                            subQuestions: {
                                type: Type.ARRAY,
                                nullable: true,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        text: { type: Type.STRING },
                                        correctAnswer: { type: Type.STRING }
                                    },
                                    required: ["text", "correctAnswer"]
                                }
                            }
                        },
                        required: ["type", "text", "solution"]
                    }
                }
            }
        });

        const textOutput = response.text || "[]";
        const rawData = JSON.parse(cleanJsonString(textOutput));
        
        return processAIQuestions(rawData);
    } catch (error: any) {
        throw new Error("Lỗi bóc tách văn bản: " + formatGeminiError(error));
    }
};

export const solveQuestionWithAI = async (
    question: Question,
    subject: string = 'Toán',
    grade: string = '12',
    customApiKey?: string
): Promise<{ solution: string; correctAnswer?: string }> => {
    const ai = getAiClient(customApiKey);

    let questionDesc = `NỘI DUNG CÂU HỎI:\n${question.text}\n`;
    if (question.type === 'mcq' && question.options) {
        questionDesc += `CÁC PHƯƠNG ÁN:\n${question.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n')}\n`;
        if (question.correctAnswer) {
            questionDesc += `ĐÁP ÁN ĐÃ CHỌN: ${question.correctAnswer}\n`;
        }
    } else if (question.type === 'group-tf' && question.subQuestions) {
        questionDesc += `CÁC Ý TRẮC NGHIỆM ĐÚNG/SAI:\n${question.subQuestions.map((sq, i) => `${String.fromCharCode(97 + i)}) ${sq.text} (Hiện tại: ${sq.correctAnswer === 'True' ? 'Đúng' : 'Sai'})`).join('\n')}\n`;
    } else if (question.type === 'short') {
        if (question.correctAnswer) {
            questionDesc += `ĐÁP SỐ ĐÃ NHẬP: ${question.correctAnswer}\n`;
        }
    }

    const prompt = `Bạn là giáo viên chuyên môn môn ${subject} khối lớp ${grade} THPT Việt Nam.
NHIỆM VỤ: Hãy giải bài toán/câu hỏi sau một cách ngắn gọn, sư phạm, bước giải súc tích, mạch lạc và chính xác 100%.

${questionDesc}

YÊU CẦU LỜI GIẢI ('solution') - BẮT BUỘC:
1. PHONG CÁCH & QUY TẮC CÔNG THỨC:
   - Trình bày đơn giản bằng các gạch đầu dòng (- ...).
   - Nêu công thức/định luật rồi ghi dấu bằng ra kết quả luôn (Dạng: [Công thức] = [Kết quả]). 
   - TUYỆT ĐỐI BỎ QUA quá trình điền/thay thế số chi tiết, vụn vặt vào giữa các phép tính để tránh rối mắt.
2. CẤU TRÚC THEO DẠNG:
   - Với MCQ (Trắc nghiệm 4 lựa chọn):
     - Áp dụng công thức: [Công thức] = [Kết quả].
     - Chọn đáp án: [Phương án đúng].
   - Với GROUP-TF (Đúng/Sai): BẮT BUỘC giải thích cho cả 4 ý theo gạch đầu dòng ngắn gọn:
     - a) [Đúng/Sai]. Vì [Công thức] = [Kết quả].
     - b) [Đúng/Sai]. Vì [Công thức] = [Kết quả đúng].
     - c) [Đúng/Sai]. Vì [Công thức / Lý do ngắn gọn].
     - d) [Đúng/Sai]. Vì [Công thức / Lý do ngắn gọn].
   - Với SHORT (Trả lời ngắn):
     - [Công thức/Định luật] = [Kết quả].
     - Đáp số: [Số].
3. CÔNG THỨC & ĐƠN VỊ:
   - Mọi công thức bọc trong $...$.
   - TUYỆT ĐỐI KHÔNG dùng \\text{...}, \\mathrm{...} (để tránh lỗi JSON escape).
   - Đơn vị viết bên ngoài dấu $ (VD: '$v = 20$ m/s', '$m = 5$ kg').
   - Chỉ số dưới viết trực tiếp (VD: $v_{max}$, $F_{ms}$).
4. ĐÁP ÁN ĐÚNG ('correctAnswer'): Nếu câu hỏi chưa có đáp án hoặc bạn tìm ra đáp án đúng, hãy cung cấp nội dung đáp án đúng.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        solution: { type: Type.STRING },
                        correctAnswer: { type: Type.STRING, nullable: true }
                    },
                    required: ["solution"]
                }
            }
        });

        const raw = safeParseJsonWithLatex(response.text || "{}") || {};
        return {
            solution: normalizeFullText(raw.solution || ""),
            correctAnswer: raw.correctAnswer ? cleanLatexTextTags(raw.correctAnswer) : undefined
        };
    } catch (error: any) {
        throw new Error("Lỗi AI giải câu hỏi: " + formatGeminiError(error));
    }
};

export const solveMultipleQuestionsWithAI = async (
    questions: Question[],
    subject: string = 'Toán',
    grade: string = '12',
    customApiKey?: string,
    onProgress?: (completed: number, total: number) => void
): Promise<Question[]> => {
    const updated: Question[] = [];
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        try {
            const res = await solveQuestionWithAI(q, subject, grade, customApiKey);
            updated.push({
                ...q,
                solution: res.solution || q.solution,
                correctAnswer: (q.type !== 'group-tf' && res.correctAnswer && !q.correctAnswer) ? res.correctAnswer : q.correctAnswer
            });
        } catch (e) {
            console.error(`Lỗi giải câu ${i + 1}:`, e);
            updated.push(q);
        }
        if (onProgress) {
            onProgress(i + 1, questions.length);
        }
    }
    return updated;
};
