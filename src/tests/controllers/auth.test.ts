import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

import app, { socketIOServer } from "../../server";
import User, { IUserType, IGender } from "../../models/user-model";

jest.mock("../../models/user-model");

// This mock replaces the original `verifyToken` function
jest.mock('../../middleware/verifyToken.ts', () => ({
  __esModule: true,
  default: jest.fn(() => (req: any, res: any, next: any) => {
    req.user = { id: "mocked-user-id", role: IUserType.GYM_OWNER };
    next();
  }),
}));

describe("Auth Endpoints", () => {
  const uploadsDir = path.join(__dirname, "../../uploads");
  const testImages: string[] = [];

  afterAll(async () => {
    await mongoose.disconnect();
    socketIOServer.close();
    
    for (const testImage of testImages) {
      const filePattern = new RegExp(
        `${testImage.replace(/\.[^/.]+$/, "")}-.*\\.(png|jpg|jpeg)$`
      );
      const files = fs.readdirSync(uploadsDir);
      const matchedFiles = files.filter((file) => filePattern.test(file));

      if (matchedFiles.length > 0) {
        for (const file of matchedFiles) {
          const filePath = path.join(uploadsDir, file);
          try {
            await fs.promises.unlink(filePath);
          } catch (err) { }
        }
      }
    }
  });

  describe("POST /signup", () => {
    it("should return 201 user created successfully", async () => {
      (User.prototype.save as jest.Mock).mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        email: "johndoe123@gmail.com",
        password: "12345",
        firstName: "John",
        lastName: "Doe",
        street: "First street",
        city: "Duke City",
        birthdate: new Date(),
        gender: IGender.MALE,
        avatar: ["http://localhost/uploads/test-image1.jpg"],
        refreshTokens: [],
        save: jest.fn().mockResolvedValue(true),
      });

      const response = await request(app)
        .post("/users/signup")
        .field("email", "johndoe123@gmail.com")
        .field("password", "12345")
        .field("firstName", "John")
        .field("lastName", "Doe")
        .field("street", "First street")
        .field("city", "Duke City")
        .field("birthdate", new Date().toISOString())
        .field("gender", IGender.MALE)
        .attach("avatar", Buffer.from("image content"), "test-image1.jpg");

      expect(response.body.message).toBe("User registered successfully");
      expect(response.status).toBe(201);
      expect(response.body.error).not.toBeDefined();

      testImages.push("test-image1.jpg");
    });
  });

  describe("POST /login", () => {
    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: "johndoe123@gmail.com",
      password: "$2b$12$kiwSU0JHcdsDVJLOxDD2AekohHwS5RVU8E5wZerlnFE7/Jibvr10W", // bcrypt for 12345
      firstName: "John",
      lastName: "Doe",
      street: "First street",
      city: "Duke City",
      birthdate: new Date(),
      gender: IGender.MALE,
      avatar: "http://example.com/avatar.jpg",
      refreshTokens: [],
      save: jest.fn().mockResolvedValue(true),
    };

    it("should login an existing user with correct credentials and return 200", async () => {
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      bcrypt.compare = jest.fn().mockResolvedValue(true); // check if password matches

      const response = await request(app)
        .post("/users/login")
        .send({
          email: "johndoe123@gmail.com",
          password: "12345",
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.email).toBe("johndoe123@gmail.com");
      expect(response.body.message).toBe("Logged in successfully");
    });

    it("should return 401 for incorrect password", async () => {
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      bcrypt.compare = jest.fn().mockResolvedValue(false); // Password mismatch

      const response = await request(app)
        .post("/users/login")
        .send({
          email: "test@example.com",
          password: "wrongpassword",
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Wrong email or password");
    });

    it("should return 401 if user does not exist", async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .post("/users/login")
        .send({
          email: "idontexist@gmail.com",
          password: "12345",
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Wrong email or password");
    });

    it("should return 400 if required fields are missing", async () => {
      const response = await request(app)
        .post("/users/login")
        .send({
          email: "",
          password: "",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.message).toBe("Validation array is not empty");
    });
  });

  describe("POST /logout", () => {

    if (!process.env.JWT_SECRET) {
      return { message: "Missing auth configuration" };
    }

    const myRefreshToken = jwt.sign(
      { id: "123", role: IUserType.USER },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION }
    );

    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: "johndoe123@gmail.com",
      password: "$2b$12$kiwSU0JHcdsDVJLOxDD2AekohHwS5RVU8E5wZerlnFE7/Jibvr10W", // bcrypt for 12345
      firstName: "John",
      lastName: "Doe",
      street: "First street",
      city: "Duke City",
      birthdate: new Date(),
      gender: IGender.MALE,
      avatarUrl: "http://example.com/avatar.jpg",
      refreshTokens: [myRefreshToken],
      save: jest.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      User.findOne = jest.fn().mockResolvedValue(mockUser);
    });

    it("should logout a user and return 200 on successful logout", async () => {

      const response = await request(app)
        .post("/users/logout")
        .send({
          refreshToken: myRefreshToken
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Logged out successfully");
      expect(mockUser.refreshTokens).toHaveLength(0);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it("should return 400 on logout because notInListToken is not on refreshTokens list", async () => {

      if (!process.env.JWT_SECRET) {
        return { message: "Missing auth configuration" };
      }

      const notInListToken = jwt.sign(
        { id: "123", role: IUserType.USER },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRATION }
      );

      const response = await request(app)
        .post("/users/logout")
        .send({
          refreshToken: notInListToken
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid refresh token");
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe("POST /refresh", () => {

    if (!process.env.JWT_SECRET) {
      return { message: "Missing auth configuration" };
    }

    const myRefreshToken = jwt.sign(
      { id: "123", role: IUserType.USER },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRATION }
    );

    const mockUser = {
      _id: new mongoose.Types.ObjectId(),
      email: "johndoe123@gmail.com",
      password: "$2b$12$kiwSU0JHcdsDVJLOxDD2AekohHwS5RVU8E5wZerlnFE7/Jibvr10W", // bcrypt for 12345
      firstName: "John",
      lastName: "Doe",
      street: "First street",
      city: "Duke City",
      birthdate: new Date(),
      gender: IGender.MALE,
      avatarUrl: "http://example.com/avatar.jpg",
      refreshTokens: [myRefreshToken],
      save: jest.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      User.findOne = jest.fn().mockResolvedValue(mockUser);
    });

    it("should return 200 with new access and refresh tokens", async () => {

      const response = await request(app)
        .post("/users/refresh")
        .send({
          refreshToken: myRefreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("New tokens generated");
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
    });
  });
});
