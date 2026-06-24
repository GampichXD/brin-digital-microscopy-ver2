from sqlalchemy import Column, Integer, String
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="OPERATOR")  # 'ADMIN' atau 'OPERATOR'

class DatasetFolder(Base):
    __tablename__ = "dataset_folders"

    id = Column(String, primary_key=True, index=True)  # ID unik string (UUID/Random)
    name = Column(String, unique=True, index=True, nullable=False)
    object_type = Column(String, nullable=False)  # Label objek AI (e.g., Bakteri E. Coli)
    date = Column(String, nullable=False)  # Tanggal pengambilan (YYYY-MM-DD)
    operator = Column(String, nullable=False)  # Nama penanggung jawab
    image_count = Column(Integer, default=0)  # Jumlah citra di dalam folder