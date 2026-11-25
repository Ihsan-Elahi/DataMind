
import { API_BASE_URL, USE_MOCK } from "../config";
import { getSession } from "../services/authService";
import { createMockResultZip } from "./mockZip";

const MOCK_JOBS_KEY = "ai-dataset-mock-jobs";
const wait = (milliseconds) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const mockModels = [
  {
    model_id: "local-map89",
    display_name: "Project Model - map89.pt",
    description: "Our pre-trained local model for image inference.",
    task_type: "object_detection",
    execution_type: "LOCAL",
    provider: "DataMind",
    version: "1.0.0",
    supported_inputs: [".zip"],
    supported_options: [
      {
        key: "confidence_threshold",
        label: "Confidence threshold",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.5,
      },
      {
        key: "image_size",
        label: "Image size",
        type: "select",
        default: "640",
        choices: ["320", "640", "1280"],
      },
    ],
    is_active: true,
  },
  {
    model_id: "api-vision-a",
    display_name: "Vision Model A",
    description: "External vision provider for general image analysis.",
    task_type: "image_classification",
    execution_type: "API",
    provider: "External provider A",
    version: "2026-01",
    supported_inputs: [".zip"],
    supported_options: [
      {
        key: "confidence_threshold",
        label: "Confidence threshold",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.6,
      },
    ],
    is_active: true,
  },
  {
    model_id: "api-vision-b",
    display_name: "Vision Model B",
    description: "External image model for detailed object recognition.",
    task_type: "object_detection",
    execution_type: "API",
    provider: "External provider B",
    version: "2.4",
    supported_inputs: [".zip"],
    supported_options: [
      {
        key: "image_size",
        label: "Image size",
        type: "select",
        default: "1024",
        choices: ["512", "1024"],
      },
    ],
    is_active: true,
  },
  {
    model_id: "api-vision-c",
    display_name: "Vision Model C",
    description: "External provider model for image segmentation.",
    task_type: "image_segmentation",
    execution_type: "API",
    provider: "External provider C",
    version: "3.1",
    supported_inputs: [".zip"],
    supported_options: [],
    is_active: true,
  },
];

function safeErrorForStatus(status) {
  if (status === 401 || status === 403) return "Please sign in again to continue.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 413) return "The uploaded file is too large.";
  if (status === 429) return "Too many requests. Please try again shortly.";
  if (status >= 500) return "The service is temporarily unavailable.";
  return "The request could not be completed. Please check your input and retry.";
}
const TASK_TYPES = {
  detect: "object_detection",
  segment: "image_segmentation",
  classify: "image_classification",
};

function normalizeModel(model) {
  const classCount = Object.keys(model.classes || {}).length;
  const isLocal = String(model.type || "LOCAL").toUpperCase() === "LOCAL";

  return {
    model_id: model.id,
    display_name: model.name || model.id,
    description: classCount
      ? `Pre-trained model that detects ${classCount} classes.`
      : "Pre-trained model for image inference.",
    task_type: TASK_TYPES[model.task] || model.task || "object_detection",
    execution_type: isLocal ? "LOCAL" : "API",
    provider: isLocal ? "Local server" : "External provider",
    version: model.version || "1.0.0",
    supported_inputs: [".zip"],
    supported_options: isLocal
      ? [
          {
            key: "confidence_threshold",
            label: "Confidence threshold",
            type: "number",
            min: 0,
            max: 1,
            step: 0.05,
            default: 0.25,
          },
          {
            key: "image_size",
            label: "Image size",
            type: "select",
            default: "640",
            choices: ["320", "640", "1280"],
          },
        ]
      : [],
    is_active: Boolean(model.available),
  };
}

async function request(path, options = {}) {
  const session = getSession();
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Unable to reach the service. Check your connection and retry.");
  }

  if (!response.ok) {
    throw new Error(safeErrorForStatus(response.status));
  }

  return response;
}

async function requestJson(path, options) {
  const response = await request(path, options);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error("The service returned an invalid response.");
  }
}

function mockSession(email, name = "") {
  return {
    token: `mock-${crypto.randomUUID()}`,
    user: {
      id: email.toLowerCase(),
      email,
      name: name || email.split("@")[0],
    },
  };
}

function getMockJobs() {
  try {
    const storedJobs = localStorage.getItem(MOCK_JOBS_KEY);
    return storedJobs ? JSON.parse(storedJobs) : [];
  } catch {
    throw new Error("Saved mock jobs could not be read from browser storage.");
  }
}

function saveMockJobs(jobs) {
  localStorage.setItem(MOCK_JOBS_KEY, JSON.stringify(jobs));
}

function currentOwnerId() {
  return getSession()?.user?.id;
}

function advanceMockJob(job) {
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) return job;

  const elapsed = Date.now() - new Date(job.created_at).getTime();
  let status = "UPLOADED";
  let progress = 5;

  if (elapsed >= 1_500) {
    status = "QUEUED";
    progress = 15;
  }
  if (elapsed >= 3_000) {
    status = "PROCESSING";
    progress = Math.min(85, 20 + Math.floor((elapsed - 3_000) / 250));
  }
  if (elapsed >= 20_000) {
    status = "PACKAGING";
    progress = 92;
  }
  if (elapsed >= 25_000) {
    status = "COMPLETED";
    progress = 100;
  }

  return {
    ...job,
    status,
    progress,
    completed_at: status === "COMPLETED" ? new Date().toISOString() : null,
  };
}

function updateMockJob(jobId, transform) {
  const ownerId = currentOwnerId();
  const jobs = getMockJobs();
  const index = jobs.findIndex(
    (job) => job.id === jobId && job.owner_id === ownerId,
  );
  if (index < 0) throw new Error("The requested job could not be found.");
  jobs[index] = transform(jobs[index]);
  saveMockJobs(jobs);
  return jobs[index];
}

function uploadRequest(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/upload`);
    const token = getSession()?.token;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("The service returned an invalid response."));
        }
      } else {
        let message = safeErrorForStatus(xhr.status);
        if (xhr.status === 400) {
          try {
            const detail = JSON.parse(xhr.responseText)?.detail;
            if (typeof detail === "string") message = detail;
          } catch {
            // keep the generic message
          }
        }
        reject(new Error(message));
      }
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Unable to reach the service. Check your connection and retry.")),
    );
    xhr.send(formData);
  });
}

export const api = {
  async register({ name, email, password }) {
    if (!USE_MOCK) {
      return requestJson("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
    }
    await wait(250);
    if (!email || !password) throw new Error("Enter an email and password.");
    return mockSession(email, name);
  },

  async login({ email, password }) {
    if (!USE_MOCK) {
      return requestJson("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    }
    await wait(250);
    if (!email || !password) throw new Error("Enter your email and password.");
    return mockSession(email);
  },

  async getModels() {
    if (!USE_MOCK) {
      const data = await requestJson("/api/models");
      if (!Array.isArray(data?.models)) {
        throw new Error("The service returned invalid model data.");
      }
      return data.models.map(normalizeModel);
    }
    await wait(200);
    return mockModels;
  },

  async getModel(modelId) {
    if (!USE_MOCK) return requestJson(`/models/${encodeURIComponent(modelId)}`);
    await wait(150);
    const model = mockModels.find((item) => item.model_id === modelId);
    if (!model) throw new Error("The selected model could not be found.");
    return model;
  },

  async uploadDataset({ file, onProgress }) {
    if (!USE_MOCK) {
      const response = await uploadRequest(file, onProgress);
      const id = response.job_id || response.id;
      if (!id) throw new Error("The service did not return a job ID.");
      return {
        id,
        total_images: response.total_images ?? null,
        file_name: file.name,
      };
    }

    onProgress?.(0);
    await wait(150);
    onProgress?.(60);
    await wait(150);
    onProgress?.(100);
    return {
      id: `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      total_images: null,
      file_name: file.name,
    };
  },

  async startJob({ jobId, fileName, modelId, options }) {
    if (!USE_MOCK) {
      return requestJson(`/api/jobs/${encodeURIComponent(jobId)}/start`, {
        method: "POST",
        body: JSON.stringify({ model_id: modelId, options }),
      });
    }

    const session = getSession();
    if (!session?.user?.id) throw new Error("Please sign in to create a job.");
    const job = {
      id: jobId,
      model_id: modelId,
      status: "UPLOADED",
      progress: 5,
      created_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
      file_name: fileName,
      options,
      owner_id: session.user.id,
    };
    saveMockJobs([job, ...getMockJobs()]);
    return job;
  },

  async getJobs() {
    if (!USE_MOCK) {
      const data = await requestJson("/api/jobs");
      const jobs = Array.isArray(data) ? data : data?.items;
      if (!Array.isArray(jobs)) throw new Error("The service returned invalid job data.");
      const ownerId = currentOwnerId();
      return jobs.filter((job) => !job.owner_id || job.owner_id === ownerId);
    }

    await wait(150);
    const ownerId = currentOwnerId();
    const jobs = getMockJobs()
      .filter((job) => job.owner_id === ownerId)
      .map(advanceMockJob);
    saveMockJobs([
      ...getMockJobs().filter((job) => job.owner_id !== ownerId),
      ...jobs,
    ]);
    return jobs;
  },

  async getJob(jobId) {
    if (!USE_MOCK) {
      const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
      const ownerId = currentOwnerId();
      if (job?.owner_id && String(job.owner_id) !== String(ownerId)) {
        throw new Error("The requested job could not be found.");
      }
      return job;
    }
    await wait(100);
    return updateMockJob(jobId, advanceMockJob);
  },

  async deleteJob(jobId) {
    if (!USE_MOCK) {
      await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
      return;
    }
    const ownerId = currentOwnerId();
    const jobs = getMockJobs();
    if (!jobs.some((job) => job.id === jobId && job.owner_id === ownerId)) {
      throw new Error("The requested job could not be found.");
    }
    saveMockJobs(
      jobs.filter((job) => job.id !== jobId || job.owner_id !== ownerId),
    );
  },

  async getJobResult(jobId) {
    const job = await this.getJob(jobId);
    if (job.status !== "COMPLETED") {
      throw new Error("Results are available after the job is completed.");
    }
    if (!USE_MOCK) {
      const response = await request(`/api/jobs/${encodeURIComponent(jobId)}/result`);
      return response.blob();
    }
    return createMockResultZip(job);
  },
};

export { USE_MOCK };
