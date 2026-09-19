import { localUploadUrl, serviceHeaders, serviceTimeout, modelServiceUrl } from "../lib/deployment.js";
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { findWardByCoordinates } from "../services/wardLocationService.js";
import { findRouteByCoordinates } from "../services/routeLocationService.js";
const surveyorRouter = Router();
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import fs from "fs";
import piexif from "piexifjs";
import axios from "axios";
import FormData from "form-data";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.cloudinary_cloud_name || "",
  api_key: process.env.cloudinary_api_key || "",
  api_secret: process.env.cloudinary_api_secret || "",
});

function hasValidCloudinaryConfig(): boolean {
  const cloudName = process.env.cloudinary_cloud_name;
  const apiKey = process.env.cloudinary_api_key;
  return Boolean(
    cloudName &&
    !cloudName.includes("your_") &&
    cloudName.trim().length > 0 &&
    apiKey &&
    !apiKey.includes("your_")
  );
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/user-images/");
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
});

const BASE_LAT = 22.287325;
const BASE_LON = 73.361665;

function randomAround(value: any, meters = 2000) {
  const maxOffset = meters / 111000;
  return value + (Math.random() * 2 - 1) * maxOffset;
}

function degToDmsRational(deg: any) {
  const absolute = Math.abs(deg);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;

  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 10000), 10000],
  ];
}

async function sendToPotholeModel(imagePath: string) {
  const form = new FormData();
  form.append("file", fs.createReadStream(imagePath));



  const response = await axios.post(
    `${modelServiceUrl}/detect_with_visualization`,
    form,
    {
      headers: {
        ...form.getHeaders(),
        ...serviceHeaders,
      },
      timeout: serviceTimeout,
      responseType: "arraybuffer",
    },
  );

  return response.data;
}

async function processImage(
  file: Express.Multer.File,
  surverySession: any,
  routeId: string | null,
  wardId: string | null,
  engineerId: string | null,
  lat?: number,
  lon?: number
) {
  const imagePath = file.path;
  console.log("[processImage] Processing image:", file.filename);
  console.log("[processImage] Received GPS - lat:", lat, "lon:", lon);

  const latitude = lat ?? null;
  const longitude = lon ?? null;

  // If GPS not provided, log clearly — do NOT silently replace with random/fallback coordinates
  if (latitude === null || longitude === null) {
    console.warn("[processImage] WARNING: No GPS coordinates provided for", file.filename, "— issue will be created with null lat/lng. Check mobile GPS pipeline.");
  } else {
    console.log(`[processImage] Using provided GPS coordinates: lat=${latitude}, lon=${longitude}`);
  }

  try {
    const jpegData = await fs.promises.readFile(imagePath, "binary");
    const exifObj = latitude !== null && longitude !== null ? {
      GPS: {
        [piexif.GPSIFD.GPSLatitudeRef]: latitude >= 0 ? "N" : "S",
        [piexif.GPSIFD.GPSLatitude]: degToDmsRational(latitude),
        [piexif.GPSIFD.GPSLongitudeRef]: longitude >= 0 ? "E" : "W",
        [piexif.GPSIFD.GPSLongitude]: degToDmsRational(longitude),
      },
    } : {};
    if (latitude !== null && longitude !== null) {
      const exifBytes = piexif.dump(exifObj);
      const newJpegData = piexif.insert(exifBytes, jpegData);
      await fs.promises.writeFile(imagePath, Buffer.from(newJpegData, "binary"));
    }
  } catch (exifErr) {
    console.warn("Exif insertion skipped/failed:", exifErr);
  }

  let finalImageUrl = "";
  try {
    const modelResult = await sendToPotholeModel(imagePath);
    const detectedImagePath = `uploads/model-images/detected-${file.filename}`;
    await fs.promises.writeFile(detectedImagePath, modelResult);
  } catch (modelErr) {
    console.warn("Pothole model service unavailable:", modelErr);
  }

  // Upload original raw photo clicked by surveyor to Cloudinary (or fallback to local server path)
  if (hasValidCloudinaryConfig()) {
    try {
      const uploadResult = await cloudinary.uploader.upload(imagePath, {
        folder: "pothole-detections",
        quality: "auto",
        fetch_format: "auto",
      });
      finalImageUrl = uploadResult.secure_url;
    } catch (cErr) {
      console.warn("[processImage] Cloudinary upload failed, falling back to local server path:", cErr);
      finalImageUrl = localUploadUrl(imagePath);
    }
  } else {
    finalImageUrl = localUploadUrl(imagePath);
  }

  if (!finalImageUrl) {
    finalImageUrl = localUploadUrl(imagePath);
  }

  console.log(`[processImage] PRE-CREATE: lat=${latitude ?? 'NULL'}, lng=${longitude ?? 'NULL'}, wardId=${wardId ?? 'NULL'}, routeId=${routeId ?? 'NULL'}, imageUrl=${finalImageUrl}`);

  const issue = await prisma.issue.create({
    data: {
      latitude: latitude as any,
      longitude: longitude as any,
      type: "POTHOLE",
      status: engineerId ? "ASSIGNED" : "DETECTED",
      wardId,
      surveySessionId: surverySession.id,
      routeId,
      imageUrl: finalImageUrl,
    },
  });

  console.log(`[processImage] POST-CREATE: issue.id=${issue.id}, issue.lat=${issue.latitude}, issue.lng=${issue.longitude}`);

  // DB round-trip verification — read back and compare
  try {
    const dbCheck = await prisma.issue.findUnique({ where: { id: issue.id } });
    if (dbCheck) {
      const latMatch = dbCheck.latitude === issue.latitude;
      const lngMatch = dbCheck.longitude === issue.longitude;
      if (latMatch && lngMatch) {
        console.log(`[processImage] DB round-trip VERIFIED ✓ id=${issue.id} lat=${dbCheck.latitude} lng=${dbCheck.longitude}`);
      } else {
        console.error(`[processImage] DB round-trip MISMATCH! id=${issue.id} sent lat=${issue.latitude}/lng=${issue.longitude} but DB has lat=${dbCheck.latitude}/lng=${dbCheck.longitude}`);
      }
    }
  } catch (verifyErr) {
    console.warn("[processImage] DB round-trip verify failed:", verifyErr);
  }

  if (engineerId) {
    await prisma.issueAssignment.create({
      data: {
        issueId: issue.id,
        engineerId,
      },
    });
  }
}

surveyorRouter.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  console.log("login");
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  try {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });

    if (user.role !== "SURVEYOR") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied. You do not have permission to use this login." });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: 'Server configuration error.' });
    }
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      jwtSecret,
      { expiresIn: "7d" },
    );

    const { password: _, ...safeUser } = user;
    res.status(200).json({ success: true, token, user: safeUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "internal server error" });
  }
});

surveyorRouter.put(
  "/acceptAssignment/:routeAssignmentId",
  requireAuth,
  requireRole("SURVEYOR"),
  async (req, res) => {
    const { routeAssignmentId } = req.params;
    if (!routeAssignmentId)
      return res.json({
        success: false,
        message: "routeAssignment id not found",
      });
    try {
      const assignment = await prisma.routeAssignment.findUnique({
        where: { id: routeAssignmentId },
      });

      if (!assignment) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid assignment ID." });
      }

      if (assignment.status !== "PENDING" && assignment.status !== "IN_PROGRESS") {
        return res.status(400).json({
          success: false,
          message: "Assignment is not in a pending state.",
        });
      }

      const updatedAssignment = await prisma.routeAssignment.update({
        where: { id: routeAssignmentId },
        data: { status: "IN_PROGRESS" },
      });
      return res.json({ success: true, data: updatedAssignment });
    } catch (error) {
      console.error("Error accepting assignment:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  },
);

surveyorRouter.post(
  "/startSurvey",
  requireAuth,
  requireRole("SURVEYOR"),
  async (req: Request, res: Response) => {
    const { routeAssignmentId, startedAt } = req.body;
    const authenticatedSurveyorId = req.user!.userId;

    if (!routeAssignmentId || !startedAt) {
      return res.json({
        success: false,
        messages: "routeAssingmentId or startedAt not found",
      });
    }
    try {
      const assignmentExists = await prisma.routeAssignment.findUnique({
        where: { id: routeAssignmentId },
      });

      if (!assignmentExists) {
        return res.status(404).json({
          success: false,
          message: "Route assignment not found. Please select a valid assignment from your dashboard.",
        });
      }

      // Verify the assignment belongs to the authenticated surveyor
      if (assignmentExists.surveyorId !== authenticatedSurveyorId) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to start a survey for this assignment.",
        });
      }

      const surverySession = await prisma.surveySession.create({
        data: {
          routeAssignmentId: assignmentExists.id,
          startedAt,
        },
      });

      return res
        .status(200)
        .json({ success: true, surverySessionId: surverySession.id });
    } catch (e) {
      console.error("startSurvey error:", e);
      return res
        .status(500)
        .json({ success: false, message: "Failed to start survey session." });
    }
  },
);

surveyorRouter.put(
  "/endSurvey",
  requireAuth,
  requireRole("SURVEYOR"),
  async (req: Request, res: Response) => {
    const { surverySessionId, endedAt } = req.body;

    if (!surverySessionId) {
      return res.status(200).json({ success: true, message: "No session ID provided" });
    }

    try {
      const sessionExists = await prisma.surveySession.findUnique({
        where: { id: surverySessionId },
      });

      if (sessionExists) {
        await prisma.surveySession.update({
          where: { id: surverySessionId },
          data: {
            endedAt: endedAt || new Date().toISOString(),
          },
        });
      }

      return res
        .status(200)
        .json({ success: true, message: "Session ended successfully" });
    } catch (e) {
      console.warn("endSurvey warning:", e);
      return res.status(200).json({ success: true, message: "Session ended" });
    }
  },
);

surveyorRouter.post(
  "/upload",
  requireAuth,
  requireRole("SURVEYOR"),
  upload.array("frames"),
  async (req, res) => {
    const { routeId, wardId, surverySessionId, routeAssignmentId, latitude, longitude } = req.body;
    console.log(
      "--------------------------------request reached----------------------------------------------",
    );

    if (!surverySessionId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing surveySessionId" });
    }
    try {
      if (!req.files || !Array.isArray(req.files)) {
        return res.status(400).json({ success: false, message: "No files" });
      }

      const files = req.files as Express.Multer.File[];

      let surverySession = await prisma.surveySession.findFirst({
        where: {
          id: surverySessionId,
        },
      });

      if (!surverySession) {
        surverySession = await prisma.surveySession.findFirst({
          orderBy: { startedAt: "desc" },
        });
      }

      if (!surverySession) {
        return res.status(400).json({ success: false, message: "No valid survey session found" });
      }

    // Use GPS coordinates for geographic ward and route detection (not routeAssignment)
    const latNum = parseFloat(latitude ? latitude.toString() : "");
    const lonNum = parseFloat(longitude ? longitude.toString() : "");
    const hasValidGps = Number.isFinite(latNum) && Number.isFinite(lonNum) && latNum !== 0 && lonNum !== 0;

    console.log(`[UPLOAD] lat=${latitude} lng=${longitude}`);

    let targetWardId: string | null = null;
    let targetRouteId: string | null = null;

    if (hasValidGps) {
      console.log(`[BACKEND] lat=${latNum} lng=${lonNum}`);
      const matchedWard = await findWardByCoordinates(latNum, lonNum);
      targetWardId = matchedWard ? matchedWard.wardId : null;
      console.log(`[WARD] matched ward=${matchedWard?.wardName || 'null'} (${targetWardId || 'null'})`);

      const matchedRoute = await findRouteByCoordinates(latNum, lonNum, targetWardId);
      targetRouteId = matchedRoute ? matchedRoute.routeId : null;
      console.log(`[ROUTE] matched route=${matchedRoute?.routeName || 'null'} (${targetRouteId || 'null'})`);
    } else {
      console.warn(`[UPLOAD] No valid GPS coordinates provided - ward and route will be unassigned.`);
    }

      res.status(202).json({
        success: true,
        message: "images accepted ",
      });

      const engineer = targetWardId ? await prisma.user.findFirst({
        where: {
          role: "ENGINEER",
          department: "POTHOLE",
          wardId: targetWardId,
        },
      }) : null;

      (async () => {
        await Promise.all(
          files.map(async (file) => {
            try {
              await processImage(
                file,
                surverySession,
                targetRouteId,
                targetWardId,
                engineer ? engineer.id : null,
                latitude ? parseFloat(latitude as string) : undefined,
                longitude ? parseFloat(longitude as string) : undefined
              );
            } catch (e) {
              console.error("Processing failed", e);
            }
          })
        );
      })();

      const updateAssignment = await prisma.routeAssignment.update({
        where: {
          id: routeAssignmentId,
        },
        data: {
          status: "COMPLETED",
        },
      });
    } catch (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ success: false });
    }
  },
);

surveyorRouter.post(
  "/reportDetection",
  requireAuth,
  requireRole("SURVEYOR"),
  upload.single("photo"),
  async (req, res) => {
    const { detectionId, routeId, wardId, surverySessionId, routeAssignmentId, latitude, longitude, confidence, accuracy, capturedAt } = req.body;
    console.log(`[BACKEND] Detection ID=${detectionId || 'N/A'} Raw latitude=${latitude} Raw longitude=${longitude} Raw accuracy=${accuracy} Raw capturedAt=${capturedAt}`);

    try {
      let targetWardId: string | null = null;
      let targetRouteId: string | null = null;
      let targetSessionId: string | null = surverySessionId || null;

      // Validate that session exists in database to prevent foreign key violations
      if (targetSessionId) {
        try {
          const existingSession = await prisma.surveySession.findUnique({
            where: { id: targetSessionId },
          });
          if (!existingSession) {
            console.warn(`[BACKEND] Session ${targetSessionId} not found in database. Proceeding without session link.`);
            targetSessionId = null;
          }
        } catch (e) {
          targetSessionId = null;
        }
      }

      // Start with no imageUrl - we'll determine it below
      let imageUrl = "";

      if (req.file) {
        const imagePath = req.file.path;
        if (hasValidCloudinaryConfig()) {
          try {
            const uploadResult = await cloudinary.uploader.upload(imagePath, {
              folder: "pothole-detections",
              quality: "auto",
              fetch_format: "auto",
            });
            imageUrl = uploadResult.secure_url;
            console.log("✅ Image uploaded to Cloudinary:", imageUrl);
          } catch (cloudErr) {
            console.warn("Cloudinary upload failed, using local server path:", cloudErr);
            imageUrl = localUploadUrl(imagePath);
          }
        } else {
          imageUrl = localUploadUrl(imagePath);
        }
      } else if (req.body.photoData && typeof req.body.photoData === "string" && req.body.photoData.length > 50) {
        try {
          const rawB64 = req.body.photoData.replace(/^data:image\/\w+;base64,/, "");
          const filename = `uploads/user-images/realtime-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
          await fs.promises.writeFile(filename, Buffer.from(rawB64, "base64"));

          if (hasValidCloudinaryConfig()) {
            try {
              const uploadResult = await cloudinary.uploader.upload(filename, {
                folder: "pothole-detections",
                quality: "auto",
                fetch_format: "auto",
              });
              imageUrl = uploadResult.secure_url;
            } catch (cloudErr) {
              imageUrl = localUploadUrl(filename);
            }
          } else {
            imageUrl = localUploadUrl(filename);
          }
          console.log("✅ Saved real-time photo to file and URL:", imageUrl);
        } catch (b64Err) {
          console.error("Failed to save base64 photoData:", b64Err);
          return res.status(400).json({ success: false, message: "Failed to process the provided photo data." });
        }
      } else if (req.body.photoUri && (req.body.photoUri.startsWith("http") || req.body.photoUri.startsWith("data:"))) {
        imageUrl = req.body.photoUri;
      }

      // Reject if no image was provided or saved
      if (!imageUrl) {
        return res.status(400).json({ success: false, message: "No photo was provided with this detection report." });
      }

      const numLat = parseFloat(latitude);
      const numLon = parseFloat(longitude);

      console.log(`[UPLOAD] lat=${latitude} lng=${longitude}`);

      if (!Number.isFinite(numLat) || numLat < -90 || numLat > 90 ||
          !Number.isFinite(numLon) || numLon < -180 || numLon > 180 ||
          (numLat === 0 && numLon === 0)) {
        console.warn(`[BACKEND] Rejected invalid/missing coordinates: latitude=${latitude}, longitude=${longitude}`);
        return res.status(400).json({
          success: false,
          message: "Invalid or missing GPS coordinates. Latitude must be between -90 and 90 and Longitude between -180 and 180.",
        });
      }

      console.log(`[BACKEND] lat=${numLat} lng=${numLon}`);

      // 1. Geographically detect Ward strictly from pothole coordinates using Ward Location Service
      const matchedWard = await findWardByCoordinates(numLat, numLon);
      targetWardId = matchedWard ? matchedWard.wardId : null;
      console.log(`[WARD] matched ward=${matchedWard?.wardName || 'null'} (${targetWardId || 'null'})`);

      // 2. Geographically detect Route strictly from pothole coordinates using Route Location Service
      const matchedRoute = await findRouteByCoordinates(numLat, numLon, targetWardId);
      targetRouteId = matchedRoute ? matchedRoute.routeId : null;
      console.log(`[ROUTE] matched route=${matchedRoute?.routeName || 'null'} (${targetRouteId || 'null'})`);

      const accuracyNum = req.body.accuracy ? parseFloat(req.body.accuracy) : null;
      const parsedAccuracy = Number.isFinite(accuracyNum) ? accuracyNum : null;
      const parsedCapturedAt = req.body.capturedAt && !isNaN(Date.parse(req.body.capturedAt))
        ? new Date(req.body.capturedAt)
        : new Date();

      const parsedConf = parseFloat(confidence) || 0.88;

      const issue = await prisma.issue.create({
        data: {
          latitude: numLat,
          longitude: numLon,
          gpsAccuracy: parsedAccuracy,
          capturedAt: parsedCapturedAt,
          type: "POTHOLE",
          status: "DETECTED",
          confidence: parsedConf,
          wardId: targetWardId,
          surveySessionId: targetSessionId,
          routeId: targetRouteId,
          imageUrl,
        },
      });

      console.log(`[DATABASE] saved lat=${issue.latitude} lng=${issue.longitude} wardId=${issue.wardId} routeId=${issue.routeId}`);

      // Verify the saved coordinates match what we received
      if (Math.abs(issue.latitude - numLat) > 0.000001 || Math.abs(issue.longitude - numLon) > 0.000001) {
        console.error(`[DATABASE] Detection ID=${detectionId || 'N/A'} COORDINATE MISMATCH! Received: lat=${numLat}, lng=${numLon}. Saved: lat=${issue.latitude}, lng=${issue.longitude}`);
      } else {
        console.log(`[DATABASE] Detection ID=${detectionId || 'N/A'} Coordinates verified: lat=${issue.latitude}, lng=${issue.longitude} match received values`);
      }

      console.log("✅ New Image & Coordinates saved to DB for Issue:", issue.id);

      // Trigger Backend AI Analysis for Admin Dashboard automatically
      (async () => {
        try {

          const form = new FormData();

          if (req.file && fs.existsSync(req.file.path)) {
            form.append("file", fs.createReadStream(req.file.path));
          } else {
            const image = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: serviceTimeout });
            form.append("file", Buffer.from(image.data), { filename: "image.jpg", contentType: "image/jpeg" });
          }

          const aiRes = await axios.post(`${modelServiceUrl}/analyze`, form, {
            headers: { ...form.getHeaders(), ...serviceHeaders },
        timeout: serviceTimeout,
          });

          const aiData = aiRes.data;
          await prisma.issueAnalysis.create({
            data: {
              issueId: issue.id,
              severity: aiData.severity || "MEDIUM",
              surfaceAreaPercent: aiData.surface_area_percent ?? 0,
              repairPatchClass: aiData.repair_patch_class || "SPOT_COLD_MIX",
              edgeRoughness: aiData.edge_roughness || "SMOOTH",
              waterlogged: aiData.waterlogged ?? false,
              sizeClass: aiData.size_class || "MEDIUM",
              priorityScore: aiData.priority_score || 5,
              recommendations: aiData.recommendations || "Routine asphalt patching recommended.",
            }
          });
          console.log("🤖 Backend AI Analysis attached for Admin Dashboard on Issue:", issue.id);
        } catch (aiErr) {
          console.warn("AI analysis unavailable; issue saved without an analysis.");
        }
      })();

      return res.status(201).json({
        success: true,
        message: "Image & Coordinates reported successfully",
        data: issue,
      });
    } catch (err) {
      console.error("reportDetection error:", err);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);

surveyorRouter.post(
  "/assignments",
  requireAuth,
  requireRole("SURVEYOR"),
  async (req: Request, res: Response) => {
    // Always use the JWT identity — never trust surveyorId from request body
    // to prevent one surveyor from fetching another surveyor's assignments.
    const authenticatedSurveyorId = req.user!.userId;

    console.log("Assignments request for authenticated userId:", authenticatedSurveyorId);

    try {
      const surveyor = await prisma.user.findUnique({
        where: { id: authenticatedSurveyorId },
      });

      if (!surveyor || surveyor.role !== "SURVEYOR") {
        return res.status(403).json({ success: false, message: "Access denied." });
      }

      let assignments = await prisma.routeAssignment.findMany({
        where: {
          surveyorId: authenticatedSurveyorId,
        },
        include: {
          route: {
            include: {
              ward: true,
            },
          },
          sessions: {
            include: {
              issues: true,
            },
          },
        },
      });

      return res.status(200).json({ success: true, assignments });
    } catch (err) {
      console.error("GET /assignments error:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  },
);

export { surveyorRouter };
