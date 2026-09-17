#!/usr/bin/env python3
"""Crea los perfiles iniciales de DICOL sin romper el vínculo Firebase/Sheets.

Antes de ejecutar, copie el valor exacto de ``Especialistas.id`` para Mailer
Roa. Este programa NO genera ese identificador: Apps Script usa el mismo valor
firmado para mostrarle únicamente su cartera.
"""

import argparse
import os
import sys
from getpass import getpass
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials, firestore

USERS = (
    {
        "name": "Sebastian Rengifo",
        "email": "Sebastianrengifo05@gmail.com",
        "role": "admin",
        "country": "Colombia",
    },
    {
        "name": "Mailer Roa",
        "email": "may161820@gmail.com",
        "role": "specialist",
        "country": "Colombia",
    },
)


def parse_args():
    parser = argparse.ArgumentParser(description="Crea los dos perfiles iniciales de DICOL.")
    parser.add_argument(
        "--service-account",
        default=os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH"),
        help="Ruta al JSON privado de Firebase o FIREBASE_SERVICE_ACCOUNT_PATH.",
    )
    parser.add_argument(
        "--mailer-specialist-id",
        default=os.environ.get("DICOL_MAILER_SPECIALIST_ID"),
        help="Valor exacto de Especialistas.id para Mailer Roa (o DICOL_MAILER_SPECIALIST_ID).",
    )
    return parser.parse_args()


def require_value(value, message):
    if not value or not str(value).strip():
        raise ValueError(message)
    return str(value).strip()


def password_for(email):
    password = getpass(f"Contraseña inicial para {email}: ")
    if len(password) < 6:
        raise ValueError("La contraseña debe tener al menos 6 caracteres.")
    return password


def initialise(path):
    account_path = Path(require_value(path, "Indique --service-account o FIREBASE_SERVICE_ACCOUNT_PATH.")).expanduser()
    if not account_path.is_file():
        raise ValueError(f"No existe el archivo de cuenta de servicio: {account_path}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(account_path)))
    return firestore.client()


def upsert_user(db, definition, specialist_id=""):
    email = definition["email"].strip().lower()
    name = definition["name"].strip()
    role = definition["role"]

    try:
        user = auth.get_user_by_email(email)
        auth.update_user(user.uid, display_name=name, disabled=False)
        created = False
    except auth.UserNotFoundError:
        user = auth.create_user(
            email=email,
            password=password_for(email),
            display_name=name,
            disabled=False,
        )
        created = True

    # Los claims son la fuente de autorización que valida Apps Script.
    claims = {"role": role}
    if role == "specialist":
        claims["specialistId"] = specialist_id
    auth.set_custom_user_claims(user.uid, claims)

    profile = {
        "uid": user.uid,
        "email": email,
        "displayName": name,
        "country": definition["country"],
        "role": role,
        "specialistId": specialist_id if role == "specialist" else None,
        "active": True,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if created:
        profile["createdAt"] = firestore.SERVER_TIMESTAMP
    db.collection("users").document(user.uid).set(profile, merge=True)

    print(f"✓ {role}: {email} (UID: {user.uid})")
    if specialist_id:
        print(f"  Vinculado a Especialistas.id: {specialist_id}")


def main():
    args = parse_args()
    # Nunca cree un UUID aquí: debe ser el ID que ya existe en la hoja.
    mailer_id = require_value(
        args.mailer_specialist_id,
        "Falta --mailer-specialist-id. Copie el ID existente de la pestaña Especialistas para Mailer Roa.",
    )
    db = initialise(args.service_account)

    for definition in USERS:
        upsert_user(db, definition, mailer_id if definition["role"] == "specialist" else "")

    print("\nListo. Cada usuario debe cerrar sesión e iniciarla otra vez para renovar su ID token.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        sys.exit(1)
