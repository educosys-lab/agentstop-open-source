from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient

from app.shared.config.config import env
from app.mongodb.user.user_type import GetUserArgs, GetUserFileDetailsArgs, UserFileType, UserType
from app.shared.types.return_type import DefaultReturnType, ErrorResponseType
from app.shared.utils.error_util import carry_error, is_error


client = AsyncIOMotorClient(env.MONGODB_URI)
db = client[env.MONGODB_NAME]
collection = db["users"]


class UserService(BaseModel):
    # Get user
    async def get_user(self, args: GetUserArgs) -> DefaultReturnType[UserType]:
        print(f"Getting user with args: {args}")
        try:
            if args.id:
                doc = await collection.find_one({"id": args.id})
            elif args.email:
                doc = await collection.find_one({"email": args.email})
            elif args.username:
                doc = await collection.find_one({"username": args.username})
            elif args.refresh_token:
                doc = await collection.find_one({"refresh_token": args.refresh_token})
            print(f"Doc: {doc}")
            if doc:
                user_instance = UserType(**doc)
                return DefaultReturnType(data=user_instance)

            return DefaultReturnType(
                error=ErrorResponseType(
                    userMessage=f"No user found!",
                    error=f"No user found!",
                    errorType="NotFoundException",
                    errorData={},
                    trace=["UserService - get_user - if not doc"],
                )
            )

        except Exception as error:
            return DefaultReturnType(
                error=ErrorResponseType(
                    userMessage=str(error),
                    error=str(error),
                    errorType="InternalServerErrorException",
                    errorData={},
                    trace=["UserService - get_user - except Exception"],
                )
            )

    # Get user files list
    async def get_user_files_list(self, user_id: str) -> DefaultReturnType[list[str]]:
        try:
            user_data = await self.get_user(GetUserArgs(id=user_id))

            if is_error(user_data.error):
                return DefaultReturnType(
                    error=carry_error(
                        user_data.error, "UserService - get_user_files_list - if isError(user_data.error)"
                    )
                )

            assert user_data.data is not None

            files = user_data.data.files
            files_list = [file.fileName for file in files]

            return DefaultReturnType(data=files_list)

        except Exception as error:
            return DefaultReturnType(
                error=ErrorResponseType(
                    userMessage=str(error),
                    error=str(error),
                    errorType="InternalServerErrorException",
                    errorData={},
                    trace=["UserService - get_user_files_list - except Exception"],
                )
            )

    # Get user file details
    async def get_user_specific_file_details(self, args: GetUserFileDetailsArgs) -> DefaultReturnType[UserFileType]:
        try:
            user_data = await self.get_user(GetUserArgs(id=args.user_id))

            if is_error(user_data.error):
                return DefaultReturnType(
                    error=carry_error(
                        user_data.error, "UserService - get_user_file_details - if isError(user_data.error)"
                    )
                )

            assert user_data.data is not None

            files = user_data.data.files
            file_details = next((file for file in files if file.fileName == args.file_name), None)

            return DefaultReturnType(data=file_details)

        except Exception as error:
            return DefaultReturnType(
                error=ErrorResponseType(
                    userMessage=str(error),
                    error=str(error),
                    errorType="InternalServerErrorException",
                    errorData={},
                    trace=["UserService - get_user_file_details - except Exception"],
                )
            )
