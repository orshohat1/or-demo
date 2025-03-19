import request from "supertest";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";

import app, { socketIOServer } from "../../server";
import User, { IUserType } from "../../models/user-model";
import Gym from "../../models/gym-model";
import { getFromCookie } from "../../controllers/auth-controller";

jest.mock("../../models/user-model");
jest.mock("../../models/gym-model");
jest.mock("../../controllers/auth-controller");

// This mock replaces the original `verifyToken` function
jest.mock('../../middleware/verifyToken.ts', () => ({
    __esModule: true,
    default: jest.fn(() => (req: any, res: any, next: any) => {
        req.user = { id: "mocked-user-id", role: IUserType.GYM_OWNER };
        next();
    }),
}));

describe("UserController Endpoints", () => {
    const userId = new mongoose.Types.ObjectId().toString();

    // images cleanup
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
                    } catch (err) {
                    }
                }
            }
        }
    });

    describe("GET /users/user/:userId", () => {
        it("should return 200 and the user data for a gym owner", async () => {
            const mockGymOwner = {
                _id: userId,
                email: "gymowner@example.com",
                password: "123456",
                firstName: "Gym",
                lastName: "Owner",
                city: "Somewhere",
                role: IUserType.GYM_OWNER,
                favoriteGyms: [],
                avatarUrl: "gym-owner.jpg",
            };

            (User.findById as jest.Mock).mockResolvedValue(mockGymOwner);

            const response = await request(app).get(`/users/user/${userId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty("email", "gymowner@example.com");
            expect(response.body.role).toBe("gym_owner");
        });

        it("should return 404 if user is not found", async () => {
            (User.findById as jest.Mock).mockResolvedValue(null);

            const response = await request(app).get(`/users/user/${userId}`);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("User not found");
        });

        it("should return 500 if there is a server error", async () => {
            (User.findById as jest.Mock).mockRejectedValue(new Error("Server error"));

            const response = await request(app).get(`/users/user/${userId}`);

            expect(response.status).toBe(500);
            expect(response.body.message).toBe("Internal server error");
        });

        it("should return 200 and the user data for a regular user", async () => {
            const mockUser = {
                _id: userId,
                email: "user@example.com",
                password: "123456",
                firstName: "Regular",
                lastName: "User",
                city: "Somewhere",
                role: IUserType.USER,
                favoriteGyms: [],
                avatarUrl: "user.jpg",
            };

            (User.findById as jest.Mock).mockResolvedValue(mockUser);

            const response = await request(app).get(`/users/user/${userId}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty("email", "user@example.com");
            expect(response.body.role).toBe("user");
        });

        it("should return 403 if the user is not a regular user or gym owner", async () => {
            const mockGymOwner = {
                _id: userId,
                email: "gymowner@example.com",
                password: "123456",
                firstName: "Gym",
                lastName: "Owner",
                city: "Somewhere",
                role: "bla",
                favoriteGyms: [],
                avatarUrl: "gym-owner.jpg",
            };

            (User.findById as jest.Mock).mockResolvedValue(mockGymOwner);

            const response = await request(app).get(`/users/user/${userId}`);

            expect(response.status).toBe(403);
            expect(response.body.message).toBe("Forbidden: Not a USER or GYM-OWNER");
        });
    });

    describe("Delete /users/", () => {
        it("should return 200 if the user was deleted successfully", async () => {
            const userId = new mongoose.Types.ObjectId().toString();
            const existingUser = {
                _id: userId,
                firstName: "John",
                lastName: "Doe",
                city: "Ramat Hasharon",
                street: "Lamerhav",
                avatarUrl: "old-avatar.jpg",
                role: IUserType.USER,
                save: jest.fn(),
            };
            
            (User.findById as jest.Mock).mockResolvedValue(existingUser);
            (User.findByIdAndDelete as jest.Mock).mockResolvedValue(existingUser);
            (getFromCookie as jest.Mock).mockResolvedValue(userId.toString());

            const mockSave = jest.fn();
            existingUser.save = mockSave;

            const response = await request(app).delete(`/users/${userId}`).set("access_token", "id=" + userId);
            expect(response.status).toBe(200);
            expect(response.body.message).toBe("User deleted successfully");
        })});


    describe("PUT /users/updateUserById/:userId", () => {
        afterAll(async () => {
            await mongoose.disconnect();
        });

        it("should update user details successfully", async () => {
            const userId = new mongoose.Types.ObjectId().toString();
            const existingUser = {
                _id: userId,
                firstName: "John",
                lastName: "Doe",
                city: "Ramat Hasharon",
                street: "Lamerhav",
                avatarUrl: "old-avatar.jpg",
                save: jest.fn(),
            };

            (User.findById as jest.Mock).mockResolvedValue(existingUser);
            const mockSave = jest.fn();
            existingUser.save = mockSave;

            const response = await request(app)
                .put(`/users/updateUserById/${userId}`)
                .field("firstName", "Or")
                .field("street", "Second street")
                .attach("avatar", Buffer.from("image content"), "new-avatar.jpg");

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("User details updated successfully");

            expect(existingUser.firstName).toBe("Or");
            expect(existingUser.street).toBe("Second street");
            expect(existingUser.avatarUrl).toContain("new-avatar");

            testImages.push("new-avatar.jpg");
        });

        it("should return 404 if user is not found", async () => {
            const userId = new mongoose.Types.ObjectId().toString();
            (User.findById as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .put(`/users/updateUserById/${userId}`)
                .send({ firstName: "Or" });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("User not found");
        });

        it("should return 400 for invalid userId", async () => {
            const response = await request(app)
                .put("/users/updateUserById/invalid-id")
                .send({ firstName: "Or" });

            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });
    });

    describe("POST /users/addFavoriteGym/:userId", () => {
        const userId = new mongoose.Types.ObjectId().toString();
        const gymId = new mongoose.Types.ObjectId().toString();

        it("should add a gym to the user's favorites successfully", async () => {
            const mockUser = {
                _id: userId,
                favoriteGyms: [],
                save: jest.fn().mockResolvedValue(true),
            };

            const mockGym = {
                _id: gymId,
                name: "Mock Gym",
            };

            (User.findById as jest.Mock).mockResolvedValue(mockUser);
            (Gym.findById as jest.Mock).mockResolvedValue(mockGym);

            const response = await request(app)
                .post(`/users/addFavoriteGym/${userId}`)
                .send({ gymId });

            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Gym added to favorites successfully");
            expect(response.body.favoriteGyms).toContain(gymId);
            expect(mockUser.favoriteGyms).toContain(gymId);
            expect(mockUser.save).toHaveBeenCalled();
        });

        it("should return 404 if the gym does not exist", async () => {
            (Gym.findById as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .post(`/users/addFavoriteGym/${userId}`)
                .send({ gymId });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("Gym not found");
        });

        it("should return 404 if the user does not exist", async () => {
            const mockGym = {
                _id: gymId,
                name: "Mock Gym",
            };

            (Gym.findById as jest.Mock).mockResolvedValue(mockGym);
            (User.findById as jest.Mock).mockResolvedValue(null);

            const response = await request(app)
                .post(`/users/addFavoriteGym/${userId}`)
                .send({ gymId });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe("User not found");
        });

        it("should return 400 if the gym is already in the user's favorites", async () => {
            const mockUser = {
                _id: userId,
                favoriteGyms: [gymId],
                save: jest.fn(),
            };

            const mockGym = {
                _id: gymId,
                name: "Mock Gym",
            };

            (User.findById as jest.Mock).mockResolvedValue(mockUser);
            (Gym.findById as jest.Mock).mockResolvedValue(mockGym);

            const response = await request(app)
                .post(`/users/addFavoriteGym/${userId}`)
                .send({ gymId });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Gym already in favorites");
        });

        it("should return 500 if there is a server error", async () => {
            (User.findById as jest.Mock).mockRejectedValue(new Error("Server error"));

            const response = await request(app)
                .post(`/users/addFavoriteGym/${userId}`)
                .send({ gymId });

            expect(response.status).toBe(500);
            expect(response.body.message).toBe("Internal server error");
        });
    });

    describe("DELETE /users/deleteFavoriteGymById", () => {
        it("should delete a gym from the user's favorites successfully", async () => {
            const userId = new mongoose.Types.ObjectId().toString();
            const gymId = new mongoose.Types.ObjectId().toString();

            const mockUser = {
                _id: userId,
                favoriteGyms: [gymId],
                save: jest.fn().mockResolvedValue(true),
            };

            (User.findById as jest.Mock).mockResolvedValue(mockUser);
            (getFromCookie as jest.Mock).mockResolvedValue(userId.toString());

            const response = await request(app)
                .delete("/users/deleteFavoriteGymById")
                .send({ gymId })
                .set("access_token", "id=" + userId);


            expect(response.status).toBe(200);
            expect(response.body.message).toBe("Gym removed from favorites successfully");
            expect(mockUser.favoriteGyms).not.toContain(gymId);
            expect(mockUser.save).toHaveBeenCalled();
        });
    });

    describe("GET /users/filter", () => {
        it("should return 200 and the filtered user data", async () => {
            const mockUsers = [
                {
                    _id: new mongoose.Types.ObjectId().toString(),
                    firstName: "John",
                    lastName: "Doe",
                    email: "johndoe@example.com",
                },
                {
                    _id: new mongoose.Types.ObjectId().toString(),
                    firstName: "Jane",
                    lastName: "Smith",
                    email: "janesmith@example.com",
                },
            ];

            const searchQuery = "john";

            (User.find as jest.Mock).mockImplementation((query) => {
                const regex = new RegExp(query.$or[0].firstName.$regex, "i");
                return Promise.resolve(mockUsers.filter(user => regex.test(user.firstName)));
            });

            const response = await request(app).get(`/users/filter?search=${searchQuery}`);

            expect(response.status).toBe(200);
            expect(response.body.users).toHaveLength(1); // Expect only one user to match
            expect(response.body.users[0].email).toBe("johndoe@example.com");
        });
    });


    it("should return 404 if no users match the search query", async () => {
        const searchQuery = "nonexistent";

        (User.find as jest.Mock).mockResolvedValue([]);

        const response = await request(app).get(`/users/filter?search=${searchQuery}`);

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("No users found matching the search criteria");
    });

    it("should return 400 if the search query is missing", async () => {
        const response = await request(app).get(`/users/filter`);

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
    });

    it("should return 500 if there is a server error", async () => {
        (User.find as jest.Mock).mockRejectedValue(new Error("Server error"));

        const searchQuery = "generalSearch";

        const response = await request(app).get(`/users/filter?search=${searchQuery}`);

        expect(response.status).toBe(500);
        expect(response.body.message).toBe("Internal server error");
    });
});

