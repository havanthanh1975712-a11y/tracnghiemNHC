
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Grade, QuestionLevel, SubQuestion } from "../types";
import { v4 as uuidv4 } from 'uuid';
import { normalizeFullText, cleanLatexTextTags } from './vietnameseFixer';

const cleanJsonString = (str: string): string => {
    let cleaned = str.replace(/```json/gi, "").replace(/```/gi, "").trim();
    // Khắc phục lỗi phổ biến: \text{...} trong chuỗi JSON bị \t biến thành ký tự Tab ASCII 9
    // Thay thế \text{...} và \mathrm{...} trong chuỗi JSON trước khi parse thành nội dung thẳng
    cleaned = cleaned.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
    cleaned = cleaned.replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1');
    cleaned = cleaned.replace(/\t+ext\s*\{([^{}]*)\}/g, '$1');
    return cleaned;
};

const normalizeLevel = (val: any): QuestionLevel | undefined => {
    if (!val) return undefined;
    const str = String(val).trim().toUpperCase();
    if (str === 'B' || str === 'NB' || str.includes('NHẬN BIẾT') || str.includes('BIẾT') || str === 'EASY' || str === 'KNOWLEDGE') return 'B';
    if (str === 'H' || str === 'TH' || str.includes('THÔNG HIỂU') || str.includes('HIỂU') || str === 'MEDIUM' || str === 'UNDERSTANDING') return 'H';
    if (str === 'VD' || str.includes('VẬN DỤNG CAO') || str === 'VDC' || str === 'VERY HARD' || str === 'VHARD') {
        if (str === 'VDC' || str.includes('CAO') || str === 'VERY HARD' || str === 'VHARD') return 'VDC';
        return 'VD';
    }
    if (str === 'HARD' || str === 'APPLICATION') return 'VD';
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
2. GIẢI CHI TIẾT 100% TẤT CẢ CÁC CÂU HỎI (BẮT BUỘC): Bất kể trong tài liệu gốc có sẵn lời giải hay chỉ có đề và đáp án, AI BẮT BUỘC PHẢI TỰ ĐỘNG GIẢI CHI TIẾT TỪNG BƯỚC CHO TỪNG CÂU HỎI VÀ ĐIỀN ĐẦY ĐỦ VÀO TRƯỜNG 'solution'. TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỂ TRỐNG TRƯỜNG 'solution' Ở BẤT KỲ CÂU HỎI NÀO.

QUY TẮC TRÍCH XUẤT VÀ LỜI GIẢI CHI TIẾT (CỰC KỲ QUAN TRỌNG):
1. PHÂN TÍCH ĐÁP ÁN:
   - Quét toàn bộ nội dung để tìm bảng đáp án (thường ở cuối trang hoặc đính kèm).
   - Nếu tài liệu không có bảng đáp án, AI phải tự giải chính xác để xác định 'correctAnswer'.

2. NHẬN DIỆN MỨC ĐỘ (level: "B" | "H" | "VD" | "VDC"):
   - Tự động nhận diện nhãn mức độ: [B], (B), [NB] -> "B" (Nhận biết); [H], (H), [TH] -> "H" (Thông hiểu); [VD], (VD) -> "VD" (Vận dụng); [VDC], (VDC) -> "VDC" (Vận dụng cao).
   - Áp dụng cho cả câu hỏi chính và từng ý con a, b, c, d của câu Đúng/Sai (Group-TF).

3. MCQ (Trắc nghiệm 4 lựa chọn):
   - 'correctAnswer': BẮT BUỘC là nội dung chính xác của phương án đúng (không kèm nhãn A, B, C, D).
   - 'solution' (LỜI GIẢI BẮT BUỘC): Trình bày chi tiết từng bước tính toán, suy luận, áp dụng định luật/công thức để chứng minh phương án đúng và giải thích ngắn gọn vì sao các phương án khác sai.

4. GROUP-TF (Trắc nghiệm Đúng/Sai):
   - 'subQuestions': BẮT BUỘC có đủ 4 ý (a, b, c, d). Mỗi ý gồm 'text', 'correctAnswer' ("True" hoặc "False") và 'level' ("B"|"H"|"VD"|"VDC").
   - 'solution' (LỜI GIẢI BẮT BUỘC CHO CẢ 4 Ý): BẮT BUỘC giải thích chi tiết, sư phạm và rõ ràng cho TẤT CẢ 4 Ý theo đúng cấu trúc:
     a) Đúng. [Giải thích chi tiết phép tính/định lý...]
     b) Sai. [Chỉ rõ điểm sai và tính toán kết quả đúng...]
     c) Đúng. [Giải thích chi tiết...]
     d) Sai. [Giải thích chi tiết...]

5. SHORT (Trả lời ngắn):
   - 'type': BẮT BUỘC là "short".
   - 'correctAnswer': BẮT BUỘC là giá trị con số chính xác (VD: "12", "-3.5", "0.25").
   - 'solution' (LỜI GIẢI BẮT BUỘC): Trình bày các bước lập luận, biến đổi toán/lý/hóa chi tiết dẫn đến kết quả con số cuối cùng.

6. QUY TẮC CÔNG THỨC & ĐƠN VỊ (QUAN TRỌNG NHẤT):
   - Mọi công thức toán học phải bọc trong cặp dấu $...$ (VD: $x^2 + y^2 = R^2$, $\\Delta t = 2$ s).
   - TUYỆT ĐỐI KHÔNG dùng thẻ \\text{...}, \\mathrm{...}, \\mbox{...} (để tránh lỗi JSON escape \\t thành 'ext').
   - Đơn vị đo (m/s, km/h, kg, g, N, J, W, V, A, Hz, s, min, h, cm, rad/s...): Viết dạng văn bản thường ngoài dấu $ (VD: '$v = 20$ m/s', '$m = 5$ kg') hoặc viết trực tiếp (VD: '$20$ m/s').
   - Chỉ số trên/dưới (VD: $v_{max}$, $F_{ms}$, $m_1$, $x_2$): Viết thẳng chữ vào chỉ số không bọc \\text{}.

7. LÀM SẠCH NHÃN:
   - Xóa nhãn "A.", "B.", "a)", "b)", "[B]", "(H)"... ở đầu nội dung câu hỏi và các phương án nhưng giữ nguyên dấu $ của LaTeX.

VÍ DỤ CẤU TRÚC JSON:
- MCQ: {"type": "mcq", "level": "B", "text": "Một vật dao động điều hòa...", "options": ["$10$ cm/s", "$20$ cm/s", "$30$ cm/s", "$40$ cm/s"], "correctAnswer": "$20$ cm/s", "solution": "Vận tốc cực đại của dao động điều hòa được tính theo công thức: $v_{max} = \\omega A = 10 \\cdot 2 = 20$ cm/s. Do đó chọn đáp án đúng là $20$ cm/s."}
- GROUP-TF: {"type": "group-tf", "level": "H", "text": "Cho một vật dao động điều hòa có phương trình $x = 5\\cos(2\\pi t)$ cm...", "subQuestions": [{"text": "Biên độ dao động của vật là $5$ cm.", "correctAnswer": "True", "level": "B"}, {"text": "Tần số góc của dao động là $4\\pi$ rad/s.", "correctAnswer": "False", "level": "B"}, {"text": "Vận tốc cực đại của vật là $10\\pi$ cm/s.", "correctAnswer": "True", "level": "H"}, {"text": "Gia tốc cực đại của vật là $100\\pi^2$ cm/s$^2$.", "correctAnswer": "False", "level": "VD"}], "solution": "a) Đúng. Từ phương trình $x = 5\\cos(2\\pi t)$ cm, ta có biên độ $A = 5$ cm.\\nb) Sai. Tần số góc là $\\omega = 2\\pi$ rad/s (không phải $4\\pi$).\\nc) Đúng. Vận tốc cực đại $v_{max} = \\omega A = 2\\pi \\cdot 5 = 10\\pi$ cm/s.\\nd) Sai. Gia tốc cực đại $a_{max} = \\omega^2 A = (2\\pi)^2 \\cdot 5 = 20\\pi^2$ cm/s$^2$ (không phải $100\\pi^2$)."}
- SHORT: {"type": "short", "level": "VD", "text": "Một mạch dao động LC lí tưởng gồm cuộn cảm thuần $L = 2$ mH và tụ điện $C = 8$ pF. Chu kỳ dao động riêng của mạch là bao nhiêu microgiây (lấy $\\pi = 3.14$, làm tròn đến 2 chữ số thập phân)?", "correctAnswer": "0.79", "solution": "Áp dụng công thức chu kỳ dao động điện từ riêng của mạch LC:\\n$T = 2\\pi\\sqrt{LC} = 2 \\cdot 3.14 \\cdot \\sqrt{2 \\cdot 10^{-3} \\cdot 8 \\cdot 10^{-12}} = 6.28 \\cdot 4 \\cdot 10^{-7} = 2.512 \\cdot 10^{-6}$ s = $2.51$ $\\mu$s.\\nKết quả làm tròn là: $0.79$."}
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
2. Solution (Lời giải): Phải có lời giải chi tiết, sư phạm cho từng câu.
3. MCQ: 'correctAnswer' phải là nội dung của phương án đúng (không kèm nhãn A, B, C, D).
4. GROUP-TF: 
   - 'subQuestions' phải có chính xác 4 ý (a, b, c, d).
   - 'solution' phải giải thích chi tiết cho từng ý theo mẫu:
     a) [Đúng/Sai] : Vì [Lý do chi tiết]
     ... (tương tự cho b, c, d)
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
    const rawData = JSON.parse(cleanJsonString(textOutput));
    
    return processAIQuestions(rawData);
  } catch (error: any) {
    throw new Error("Lỗi đọc PDF: " + formatGeminiError(error));
  }
};

export const parseQuestionsFromJSON = (input: string | any): { questions: Question[]; quizTitle?: string; grade?: Grade; category?: string; durationMinutes?: number } => {
    let parsed: any;
    if (typeof input === 'string') {
        try {
            const cleanStr = cleanJsonString(input);
            parsed = JSON.parse(cleanStr);
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
NHIỆM VỤ: Hãy giải bài toán/câu hỏi sau một cách chi tiết, sư phạm, bước giải rõ ràng, mạch lạc và chính xác 100%.

${questionDesc}

YÊU CẦU ĐẶC BIỆT (BẮT BUỘC):
1. LỜI GIẢI CHI TIẾT ('solution'):
   - Với MCQ (Trắc nghiệm 4 lựa chọn): Trình bày các bước tính toán/lập luận cụ thể và chốt phương án đúng.
   - Với GROUP-TF (Đúng/Sai): BẮT BUỘC giải thích chi tiết cho cả 4 ý theo mẫu:
     a) Đúng. [Giải thích chi tiết phép tính/định lý...]
     b) Sai. [Chỉ rõ điểm sai và tính lại kết quả đúng...]
     c) Đúng. [Giải thích chi tiết...]
     d) Sai. [Giải thích chi tiết...]
   - Với SHORT (Trả lời ngắn): Trình bày các bước giải chi tiết dẫn đến kết quả số cuối cùng.
2. CÔNG THỨC & ĐƠN VỊ:
   - Mọi công thức bọc trong $...$.
   - TUYỆT ĐỐI KHÔNG dùng \\text{...}, \\mathrm{...} (để tránh lỗi JSON escape).
   - Đơn vị viết bên ngoài dấu $ (VD: '$v = 20$ m/s', '$m = 5$ kg').
   - Chỉ số dưới viết trực tiếp (VD: $v_{max}$, $F_{ms}$).
3. ĐÁP ÁN ĐÚNG ('correctAnswer'): Nếu câu hỏi chưa có đáp án hoặc bạn tìm ra đáp án đúng, hãy cung cấp nội dung đáp án đúng.`;

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

        const raw = JSON.parse(cleanJsonString(response.text || "{}"));
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
