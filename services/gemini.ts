
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Grade, QuestionLevel, SubQuestion } from "../types";
import { v4 as uuidv4 } from 'uuid';
import { normalizeFullText } from './vietnameseFixer';

const cleanJsonString = (str: string): string => {
    return str.replace(/```json/gi, "").replace(/```/gi, "").trim();
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
    let cleanText = text;
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
    // Chuẩn hóa dấu tiếng Việt và LaTeX trước
    let cleaned = normalizeFullText(text.trim());
    // Xử lý đệ quy để xóa nhiều lớp nhãn (VD: "A. A. Nội dung")
    const labelRegex = /^(\*?[A-Za-z0-9][\.\)\/\-:\s]\s*)/g;
    
    while (labelRegex.test(cleaned)) {
        cleaned = cleaned.replace(labelRegex, "").trim();
    }
    return cleaned;
};

const EXTRACTION_INSTRUCTION = `Bạn là chuyên gia trích xuất đề thi THPT quốc gia Việt Nam (Toán, Lý, Hóa).
NHIỆM VỤ: Chuyển đổi nội dung được cung cấp thành danh sách JSON chuẩn.

QUY TẮC TRÍCH XUẤT (CỰC KỲ QUAN TRỌNG):
1. PHÂN TÍCH ĐÁP ÁN: Quét toàn bộ nội dung để tìm bảng đáp án (thường ở cuối).
2. NHẬN DIỆN MỨC ĐỘ (level: "B" | "H" | "VD" | "VDC"):
   - Tự động nhận diện nhãn mức độ: [B], (B) -> "B" (Nhận biết); [H], (H) -> "H" (Thông hiểu); [VD], (VD) -> "VD" (Vận dụng); [VDC], (VDC) -> "VDC" (Vận dụng cao).
   - Áp dụng cho cả câu hỏi chính và từng ý con a, b, c, d của câu Đúng/Sai (Group-TF).
3. MCQ (Trắc nghiệm 4 lựa chọn):
   - 'correctAnswer': BẮT BUỘC điền nội dung của phương án đúng (không kèm nhãn A, B...).
   - LaTeX: Mọi phương án nếu chứa ký hiệu toán học BẮT BUỘC phải bọc trong $...$. (VD: "$x^2$").
4. GROUP-TF (Đúng/Sai):
   - 'subQuestions': Phải có đủ 4 ý (a, b, c, d). Mỗi ý có 'text', 'correctAnswer' ("True" hoặc "False") và 'level' ("B"|"H"|"VD"|"VDC" nếu có).
   - 'solution': BẮT BUỘC giải thích chi tiết cho cả 4 ý theo mẫu: a) Đúng... b) Sai...
5. SHORT (Trả lời ngắn):
   - 'type': BẮT BUỘC là "short".
   - 'correctAnswer': BẮT BUỘC là giá trị số (VD: "12", "0.5").
   - 'options': Để null hoặc [].
6. LaTeX: Mọi công thức toán học phải bọc trong $...$ (VD: $x^2 + y^2 = R^2$). Giữ nguyên dấu $ trong cả nội dung câu hỏi và các phương án.
7. LÀM SẠCH: Xóa nhãn "A.", "B.", "a)", "b)", "[B]", "(H)"... ở đầu nội dung nhưng giữ lại dấu $ của LaTeX.

VÍ DỤ CẤU TRÚC:
- MCQ: {"type": "mcq", "level": "B", "text": "Cho hàm số...", "options": ["$1$", "$2$", "$3$", "$4$"], "correctAnswer": "$1$", "solution": "..."}
- GROUP-TF: {"type": "group-tf", "level": "H", "text": "Cho hàm số...", "subQuestions": [{"text": "...", "correctAnswer": "True", "level": "B"}, {"text": "...", "correctAnswer": "False", "level": "H"}, ...], "solution": "a) Đúng... b) Sai..."}
- SHORT: {"type": "short", "level": "VD", "text": "Tìm số nghiệm...", "correctAnswer": "12.5", "solution": "..."}
`;

const processAIQuestions = (rawData: any[]): Question[] => {
    return rawData.map((item: any) => {
        const type = item.type?.toLowerCase() || 'mcq';
        const strippedOptions = item.options ? item.options.map((opt: string) => stripOptionLabel(opt)) : (type === 'mcq' ? [] : undefined);
        let finalCorrectAnswer = item.correctAnswer;

        // Xử lý trích xuất level từ text câu hỏi nếu chưa có
        let extractedMain = extractLevelFromText(item.text || "");
        let finalLevel = normalizeLevel(item.level) || extractedMain.level;
        let cleanedText = extractedMain.cleanText;

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
1. LaTeX: Mọi biểu thức, công thức, ký hiệu toán/lý/hóa (VD: $\\Delta\\Phi$, $\\Omega$, $x^2$, $\\vec{v}$) BẮT BUỘC phải nằm trong cặp dấu $...$. Quy tắc này áp dụng cho NỘI DUNG CÂU HỎI, CÁC PHƯƠNG ÁN (Options), và LỜI GIẢI (Solution).
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
