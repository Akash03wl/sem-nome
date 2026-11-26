//! Comandos do PC que o Vitra executa.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SystemCommand {
    Shutdown,
    Restart,
    Sleep,
    Lock,
    Logoff,
    EmptyRecycleBin,
}

impl SystemCommand {
    /// Pede um segundo clique: pode fazer perder trabalho ou não dá para desfazer.
    pub fn needs_confirm(self) -> bool {
        matches!(self, Self::Shutdown | Self::Restart | Self::Logoff | Self::EmptyRecycleBin)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Shutdown => "Desligar",
            Self::Restart => "Reiniciar",
            Self::Sleep => "Suspender",
            Self::Lock => "Bloquear",
            Self::Logoff => "Sair da conta",
            Self::EmptyRecycleBin => "Esvaziar lixeira",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SystemCommand::*;
    use super::*;

    #[test]
    fn system_command_confirm_and_labels() {
        let all = [Shutdown, Restart, Sleep, Lock, Logoff, EmptyRecycleBin];
        let confirm: Vec<_> = all.iter().filter(|c| c.needs_confirm()).collect();
        assert_eq!(confirm, vec![&Shutdown, &Restart, &Logoff, &EmptyRecycleBin]);
        let labels: Vec<_> = all.iter().map(|c| c.label()).collect();
        assert_eq!(labels, vec!["Desligar", "Reiniciar", "Suspender", "Bloquear", "Sair da conta", "Esvaziar lixeira"]);
    }

    #[test]
    fn system_command_from_json() {
        let c: SystemCommand = serde_json::from_str(r#""emptyRecycleBin""#).unwrap();
        assert_eq!(c, EmptyRecycleBin);
    }
}
