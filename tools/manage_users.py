#!/usr/bin/env python3
"""Administración local de perfiles Firebase para DICOL.

Este script se ejecuta únicamente en un equipo autorizado con una cuenta de
servicio privada de Firebase. Nunca se publica como parte del portal web.
"""

import argparse
import os
import sys

import firebase_admin
from firebase_admin import auth, credentials, exceptions, firestore


def add_common_arguments(parser):
    parser.add_argument(
        "--service-account",
        default=os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH"),
        help="Ruta al JSON privado de la cuenta de servicio. También admite FIREBASE_SERVICE_ACCOUNT_PATH.",
    )


def initialize(service_account_path):
    if not service_account_path:
        raise ValueError("Indique --service-account o configure FIREBASE_SERVICE_ACCOUNT_PATH.")
    if not os.path.isfile(service_account_path):
        raise ValueError(f"No existe el archivo de cuenta de servicio: {service_account_path}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(service_account_path))
    return firestore.client()


def upsert_user(args):
    if args.role == "specialist" and not args.specialist_id:
        raise ValueError("Un especialista requiere --specialist-id (el ID de la pestaña Especialistas en Google Sheets).")

    db = initialize(args.service_account)
    email = args.email.strip().lower()
    display_name = args.name.strip()
    created = False

    try:
        user = auth.get_user_by_email(email)
        update = {"display_name": display_name, "disabled": False}
        if args.password:
            update["password"] = args.password
        user = auth.update_user(user.uid, **update)
    except auth.UserNotFoundError:
        if not args.password:
            raise ValueError("Una cuenta nueva requiere --password.")
        created = True
        user = auth.create_user(
            email=email,
            password=args.password,
            display_name=display_name,
            disabled=False,
        )

    claims = dict(user.custom_claims or {})
    claims["role"] = args.role
    if args.role == "specialist":
        claims["specialistId"] = args.specialist_id.strip()
    else:
        claims.pop("specialistId", None)
    auth.set_custom_user_claims(user.uid, claims)

    profile = {
        "uid": user.uid,
        "email": email,
        "displayName": display_name,
        "role": args.role,
        "specialistId": args.specialist_id.strip() if args.role == "specialist" else None,
        "active": True,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }
    if created:
        profile["createdAt"] = firestore.SERVER_TIMESTAMP
    db.collection("users").document(user.uid).set(profile, merge=True)

    print(f"Perfil {args.role} guardado para {email}.")
    print(f"UID: {user.uid}")
    print("La persona debe cerrar sesión y entrar de nuevo para recibir el rol actualizado.")


def disable_user(args):
    db = initialize(args.service_account)
    email = args.email.strip().lower()
    user = auth.get_user_by_email(email)
    auth.update_user(user.uid, disabled=True)
    db.collection("users").document(user.uid).set(
        {"active": False, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True
    )
    print(f"Perfil desactivado: {email}")


def build_parser():
    parser = argparse.ArgumentParser(description="Crea, actualiza o desactiva perfiles Firebase de DICOL.")
    commands = parser.add_subparsers(dest="command", required=True)

    upsert = commands.add_parser("upsert", help="Crea o actualiza un administrador o especialista.")
    add_common_arguments(upsert)
    upsert.add_argument("--email", required=True)
    upsert.add_argument("--name", required=True)
    upsert.add_argument("--role", required=True, choices=("admin", "specialist"))
    upsert.add_argument("--specialist-id", help="ID del especialista en Google Sheets; obligatorio para role specialist.")
    upsert.add_argument("--password", help="Obligatoria al crear una cuenta; opcional al actualizarla.")
    upsert.set_defaults(handler=upsert_user)

    disable = commands.add_parser("disable", help="Desactiva una cuenta y su perfil.")
    add_common_arguments(disable)
    disable.add_argument("--email", required=True)
    disable.set_defaults(handler=disable_user)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        args.handler(args)
    except (ValueError, exceptions.FirebaseError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
